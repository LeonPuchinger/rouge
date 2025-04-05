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
  FunctionSymbolValue,
  RuntimeSymbol,
  runtimeTable,
  SymbolFlags,
  SymbolValue,
} from "../symbol.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
  SymbolType,
  typeTable,
} from "../type.ts";
import { zip } from "../util/array.ts";
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
    const memberParameterTypes = memberType.parameterTypes;
    return memberParameterTypes.length >= 1 &&
      memberParameterTypes[0].typeCompatibleWith(parentType);
  }

  analyzePlaceholders(
    invokedType: FunctionSymbolType | CompositeSymbolType,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const expectedPlaceholders = invokedType.placeholders;
    if (expectedPlaceholders.size != this.placeholders.length) {
      findings.errors.push(AnalysisError({
        message:
          `Expected ${expectedPlaceholders.size} placeholders but ${this.placeholders.length} were supplied.`,
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
    functionType = functionType.fork();
    const expectedParameterTypes = functionType.parameterTypes;
    const foundParameterTypes = this.parameters
      .map((parameter) => parameter.resolveType());
    if (expectedParameterTypes.length != foundParameterTypes.length) {
      findings.errors.push(AnalysisError({
        message:
          `Expected ${expectedParameterTypes.length} parameters but ${foundParameterTypes.length} were supplied.`,
        beginHighlight: this.parameters.at(0) ??
          DummyAstNode.fromToken(this.openParenthesis),
        endHighlight: Some(
          this.parameters.at(-1) ??
            DummyAstNode.fromToken(this.closingParenthesis),
        ),
      }));
    }
    const placeholdersFindings = this.analyzePlaceholders(functionType);
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
          messageHighlight: "",
        }));
      }
    }
    return findings;
  }

  analyzeMethod(
    functionType: FunctionSymbolType,
  ): AnalysisFindings {
    functionType = functionType.fork();
    functionType.parameterTypes.shift();
    return this.analyzeFunctionInvocation(functionType);
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
    const isMethod = isFunction && this.isMethod();
    if (!isFunction) {
      findings.errors.push(AnalysisError({
        message:
          "The expression cannot be invoked because it is neither a function nor a type.",
        beginHighlight: this.symbol,
        endHighlight: None(),
        messageHighlight: "",
      }));
    }
    if (ignoreFunction || findings.isErroneous()) {
      return findings;
    }
    if (isFunction && !isMethod) {
      findings = AnalysisFindings.merge(
        findings,
        this.analyzeFunctionInvocation(calledType as FunctionSymbolType),
      );
    }
    if (isMethod) {
      findings = AnalysisFindings.merge(
        findings,
        this.analyzeMethod(calledType as FunctionSymbolType),
      );
    }
    return findings;
  }

  evaluateFunction(
    functionSymbolValue: FunctionSymbolValue,
    defaultParameters: Map<string, SymbolValue> = new Map(),
  ): SymbolValue<unknown> {
    runtimeTable.pushScope();
    const parameterNames = functionSymbolValue.parameterNames;
    let offset = 0;
    for (
      let index = 0;
      index < functionSymbolValue.parameterNames.length;
      index += 1
    ) {
      const parameterName = parameterNames[index];
      if (defaultParameters.has(parameterName)) {
        offset += 1;
        runtimeTable.setSymbol(
          parameterName,
          new RuntimeSymbol({
            value: defaultParameters.get(parameterName)!,
          }),
        );
        continue;
      }
      const symbolValue = this.parameters[index - offset].evaluate();
      runtimeTable.setSymbol(
        parameterName,
        new RuntimeSymbol({
          value: symbolValue,
        }),
      );
    }
    let returnValue: SymbolValue = nothingInstance;
    try {
      functionSymbolValue.value.interpret();
    } catch (exception) {
      if (exception instanceof ReturnValueContainer) {
        returnValue = exception.value;
      }
    }
    runtimeTable.popScope();
    return returnValue;
  }

  evaluate(): SymbolValue<unknown> {
    const calledSymbol = this.symbol.evaluate();
    const partOfStdlib = this.symbol.resolveFlags().get("stdlib") ?? false;
    if (partOfStdlib) {
      // grant the invocation access to the runtime
      runtimeTable.ignoreRuntimeBindings = false;
    }
    const defaultParameters = new Map<string, SymbolValue>();
    if (this.isMethod()) {
      const parentInstance = this.parent
        .map((parent) => parent.evaluate())
        .unwrapOr(nothingInstance);
      defaultParameters.set("this", parentInstance);
    }
    const result = this.evaluateFunction(
      calledSymbol as FunctionSymbolValue,
      defaultParameters,
    );
    runtimeTable.ignoreRuntimeBindings = true;
    return result;
  }

  resolveType(): SymbolType {
    const calledType = this.symbol.resolveType();
    const functionType = (calledType as FunctionSymbolType).fork();
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
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
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
