import {
  alt_sc,
  apply,
  kleft,
  kmid,
  list_sc,
  opt,
  opt_sc,
  Parser,
  rep_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { Option } from "../main.ts";
import {
  analysisTable,
  FunctionSymbolValue,
  RuntimeSymbol,
  runtimeTable,
  SymbolValue,
} from "../symbol.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
  SymbolType,
  typeTable,
} from "../type.ts";
import { zip } from "../util/array.ts";
import { InternalError } from "../util/error.ts";
import { None, Some } from "../util/monad/option.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { nothingInstance, WithOptionalAttributes } from "../util/type.ts";
import {
  configureExpression,
  expression,
  ExpressionAstNode,
} from "./expression.ts";
import { ReturnValueContainer } from "./function.ts";
import { invocation } from "./parser_declarations.ts";
import {
  propertyAccess,
  PropertyAccessAstNode,
  referenceExpression,
  ReferenceExpressionAstNode,
} from "./symbol_expression.ts";

/* AST NODES */

export class InvocationAstNode implements EvaluableAstNode {
  parent!: Option<EvaluableAstNode>;
  symbol!: EvaluableAstNode;
  parameters!: ExpressionAstNode[];
  placeholders!: Token<TokenKind>[];
  openParenthesis!: Token<TokenKind>;
  closingParenthesis!: Token<TokenKind>;

  constructor(params: WithOptionalAttributes<InvocationAstNode>) {
    Object.assign(this, params);
    this.parent = Some(params.parent);
  }

  /**
   * Determines whether the called expression is a method or not.
   * Can only safely be called after static analysis has successfully
   * been performed on the member (symbol) AST nodes.
   */
  isMethod(): boolean {
    const isMember = this.parent.hasValue();
    if (!isMember) {
      return false;
    }
    const parent = this.parent.unwrap();
    const parentType = parent.resolveType().peel();
    const memberType = this.symbol.resolveType().peel() as FunctionSymbolType;
    const memberInstance = this.symbol.evaluate() as FunctionSymbolValue;
    const memberParameters = memberInstance.parameterNames;
    const memberParameterTypes = memberType.parameterTypes;
    const nameMatch = memberParameters.length >= 1 &&
      memberParameters[0] == "this";
    const typeMatch = memberParameterTypes.length >= 1 &&
      memberParameterTypes[0].typeCompatibleWith(parentType);
    return nameMatch && typeMatch;
  }

  analyzePlaceholders(
    invokedType: FunctionSymbolType | CompositeSymbolType,
    construct: "structure" | "function",
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const expectedPlaceholders = invokedType.placeholders;
    if (expectedPlaceholders.size != this.placeholders.length) {
      findings.errors.push(AnalysisError({
        message:
          `The ${construct} expected ${expectedPlaceholders.size} placeholders but ${this.placeholders.length} were supplied.`,
        beginHighlight: Some(this.placeholders.at(0))
          .map(DummyAstNode.fromToken)
          .unwrapOr(this.symbol),
        endHighlight: Some(this.placeholders.at(-1))
          .map(DummyAstNode.fromToken),
        messageHighlight: "",
      }));
    }
    for (const placeholder of this.placeholders) {
      const placeholderName = placeholder.text;
      if (!typeTable.findType(placeholderName).hasValue()) {
        findings.errors.push(AnalysisError({
          message: `The type called '${placeholderName}' could not be found.`,
          beginHighlight: DummyAstNode.fromToken(placeholder),
          endHighlight: None(),
          messageHighlight: "",
        }));
      }
    }
    return findings;
  }

  analyzeFunctionInvocation(
    functionType: FunctionSymbolType,
  ): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    const isConstructor = typeTable.findType(this.name.text).hasValue();
    const construct = isConstructor ? "structure" : "function";
    functionType = functionType.fork();
    const expectedParameterTypes = functionType.parameterTypes;
    const foundParameterTypes = this.parameters
      .map((parameter) => parameter.resolveType());
    if (expectedParameterTypes.length != foundParameterTypes.length) {
      findings.errors.push(AnalysisError({
        message:
          `The ${construct} expected ${expectedParameterTypes.length} parameters but ${foundParameterTypes.length} were supplied.`,
        beginHighlight: this.parameters.at(0) ??
          DummyAstNode.fromToken(this.openParenthesis),
        endHighlight: Some(
          this.parameters.at(-1) ??
            DummyAstNode.fromToken(this.closingParenthesis),
        ),
      }));
    }
    const placeholdersFindings = this.analyzePlaceholders(
      functionType,
      "function",
    );
    findings = AnalysisFindings.merge(
      findings,
      placeholdersFindings,
    );
    if (placeholdersFindings.isErroneous()) {
      return findings;
    }
    // bind placeholdes to the supplied types
    for (
      const [placeholder, suppliedType] of zip(
        Array.from(functionType.placeholders.values()),
        this.placeholders.map((placeholder) =>
          typeTable.findType(placeholder.text)
            .map(([type, _flags]) => type)
        ),
      )
    ) {
      placeholder.bind(suppliedType.unwrap());
    }
    for (
      let index = 0;
      index <
        Math.min(expectedParameterTypes.length, foundParameterTypes.length);
      index += 1
    ) {
      const expectedParameterType = expectedParameterTypes[index];
      const foundParameterType = foundParameterTypes[index];
      if (!expectedParameterType.typeCompatibleWith(foundParameterType)) {
        findings.errors.push(AnalysisError({
          message:
            `Type '${foundParameterType.displayName()}' is incompatible with '${expectedParameterType.displayName()}'.`,
          beginHighlight: this.parameters[index],
          endHighlight: None(),
        }));
      }
    }
    return findings;
  }

  analyze(): AnalysisFindings {
    let findings = this.parameters
      .map((parameter) => parameter.analyze())
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    findings = AnalysisFindings.merge(
      findings,
      this.symbol.analyze(),
    );
    if (findings.isErroneous()) {
      return findings;
    }
    const calledType = this.symbol.resolveType().peel();
    const isFunction = calledType.isFunction();
    const ignoreFunction = calledType.ignore();
    if (!isFunction) {
      findings.errors.push(AnalysisError({
        message:
          "The expression cannot be invoked because it is neither a function nor a type.",
        beginHighlight: this.symbol,
        endHighlight: None(),
        messageHighlight: "",
      }));
    }
    if (isFunction && !findings.isErroneous() && !ignoreFunction) {
      findings = AnalysisFindings.merge(
        findings,
        this.analyzeFunctionInvocation(calledType as FunctionSymbolType),
      );
    }
    return findings;
  }

  evaluateFunction(
    functionSymbol: RuntimeSymbol<FunctionSymbolValue>,
  ): SymbolValue<unknown> {
    runtimeTable.pushScope();
    const parameterNames = functionSymbol.value.parameterNames;
    for (let index = 0; index < this.parameters.length; index += 1) {
      const parameterName = parameterNames[index];
      const symbolValue = this.parameters[index].evaluate();
      runtimeTable.setSymbol(
        parameterName,
        new RuntimeSymbol({
          value: symbolValue,
        }),
      );
    }
    let returnValue: SymbolValue = nothingInstance;
    try {
      functionSymbol.value.value.interpret();
    } catch (exception) {
      if (exception instanceof ReturnValueContainer) {
        returnValue = exception.value;
      }
    }
    runtimeTable.popScope();
    return returnValue;
  }

  evaluate(): SymbolValue<unknown> {
    const calledSymbol = runtimeTable.findSymbol(this.name.text);
    const partOfStdlib = calledSymbol
      .map(([_symbol, flags]) => flags.stdlib)
      .unwrapOr(false);
    if (partOfStdlib) {
      // grant the invocation access to the runtime
      runtimeTable.ignoreRuntimeBindings = false;
    }
    if (calledSymbol.hasValue()) {
      const [symbol, _flags] = calledSymbol.unwrap();
      const result = this.evaluateFunction(
        symbol as RuntimeSymbol<FunctionSymbolValue>,
      );
      runtimeTable.ignoreRuntimeBindings = true;
      return result;
    }
    throw new InternalError(
      `Unable to resolve a runtime symbol by the name '${this.name.text}'.`,
      "This should have been caught during static analysis.",
    );
  }

  resolveType(): SymbolType {
    return analysisTable
      .findSymbol(this.name.text)
      .map(([symbol, _flags]) => {
        const functionType = (symbol.valueType as FunctionSymbolType).fork();
        // bind placeholdes to the supplied types
        for (
          const [placeholder, suppliedType] of zip(
            Array.from(functionType.placeholders.values()),
            this.placeholders.map((placeholder) =>
              typeTable.findType(placeholder.text)
                .map(([type, _flags]) => type)
            ),
          )
        ) {
          placeholder.bind(suppliedType.unwrap());
        }
        return functionType.returnType;
      })
      .unwrapOrElse(
        typeTable
          .findType(this.name.text)
          .map(([type, _flags]) => type)
          .unwrap,
      );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [
      this.parent
        .map((parent) => parent.tokenRange()[0])
        .unwrapOr(this.symbol.tokenRange()[0]),
      this.closingParenthesis,
    ];
  }
}

/* PARSER */

const placeholderNames = kleft(
  list_sc(tok(TokenKind.ident), surround_with_breaking_whitespace(str(","))),
  opt_sc(str(",")),
);

const placeholders = kmid(
  str<TokenKind>("<"),
  surround_with_breaking_whitespace(opt_sc(placeholderNames)),
  str<TokenKind>(">"),
);

const parameters = list_sc(
  expression,
  surround_with_breaking_whitespace(str(",")),
);

const memberAccess = apply(
  seq(
    referenceExpression,
    rep_sc(
      starts_with_breaking_whitespace(
        propertyAccess,
      ),
    ),
  ),
  ([rootSymbol, propertyAccesses]) => {
    const [parent, finalMember] = propertyAccesses.reduce<
      [ReferenceExpressionAstNode | undefined, ReferenceExpressionAstNode]
    >(
      ([_, currentMember], property) => {
        const newMember = new PropertyAccessAstNode({
          identifierToken: property,
          parent: currentMember,
        });
        return [currentMember, newMember];
      },
      [undefined, rootSymbol],
    );
    return [parent, finalMember] as [
      ReferenceExpressionAstNode | undefined,
      ReferenceExpressionAstNode,
    ];
  },
);

const customExpression: Parser<TokenKind, [
  EvaluableAstNode | undefined,
  EvaluableAstNode,
]> = alt_sc(
  apply(
    configureExpression({
      includeInvocation: false,
      includeSymbolExpression: false,
    }),
    (result) => [undefined, result],
  ),
  memberAccess,
);

invocation.setPattern(apply(
  seq(
    customExpression,
    opt_sc(starts_with_breaking_whitespace(placeholders)),
    surround_with_breaking_whitespace(str("(")),
    opt(parameters),
    starts_with_breaking_whitespace(str(")")),
  ),
  (
    [
      [parent, member],
      placeholders,
      openParenthesis,
      parameters,
      closingParenthesis,
    ],
  ) =>
    new InvocationAstNode({
      parent: parent,
      symbol: member,
      parameters: parameters ?? [],
      placeholders: placeholders ?? [],
      openParenthesis: openParenthesis,
      closingParenthesis: closingParenthesis,
    }),
));
