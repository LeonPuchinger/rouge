import {
  apply,
  kleft,
  kmid,
  list_sc,
  opt,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  CompositeSymbolValue,
  FunctionSymbolValue,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
  SymbolValue,
} from "../symbol.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
  SymbolType,
  typeTable,
} from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None, Some } from "../util/monad/option.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, nothingInstance } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { ReturnValueContainer } from "./function.ts";
import { invocation } from "./parser_declarations.ts";

/* AST NODES */

export class InvocationAstNode implements EvaluableAstNode {
  name!: Token<TokenKind>;
  parameters!: ExpressionAstNode[];
  placeholders!: Token<TokenKind>[];
  openParenthesis!: Token<TokenKind>;
  closingParenthesis!: Token<TokenKind>;

  constructor(params: Attributes<InvocationAstNode>) {
    Object.assign(this, params);
  }

  analyzeFunctionInvocation(
    functionSymbol: StaticSymbol<FunctionSymbolType>,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const expectedParameterTypes = functionSymbol.valueType.parameterTypes;
    const foundParameters = this.parameters;
    const foundParameterTypes = foundParameters
      .map((parameter) => parameter.resolveType());
    if (expectedParameterTypes.length != foundParameterTypes.length) {
      findings.errors.push(AnalysisError({
        message:
          `The function expected ${expectedParameterTypes.length} parameters but ${foundParameterTypes.length} were supplied.`,
        beginHighlight: this.parameters.at(0) ??
          DummyAstNode.fromToken(this.openParenthesis),
        endHighlight: Some(
          this.parameters.at(-1) ??
            DummyAstNode.fromToken(this.closingParenthesis),
        ),
      }));
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
          beginHighlight: foundParameters[index],
          endHighlight: None(),
        }));
      }
    }
    return findings;
  }

  analyzeStructureInvocation(
    structureType: CompositeSymbolType,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const expectedFields = structureType.fields;
    const expectedFieldTypes = Array.from(expectedFields.values());
    const foundFields = this.parameters;
    const foundFieldTypes = foundFields.map((field) => field.resolveType());
    if (expectedFieldTypes.length != foundFieldTypes.length) {
      findings.errors.push(AnalysisError({
        message:
          `The structure expected ${expectedFieldTypes.length} fields but ${foundFieldTypes.length} were supplied.`,
        beginHighlight: this.parameters.at(0) ??
          DummyAstNode.fromToken(this.openParenthesis),
        endHighlight: Some(
          this.parameters.at(-1) ??
            DummyAstNode.fromToken(this.closingParenthesis),
        ),
      }));
    }
    const expectedPlaceholders = structureType.placeholders;
    if (expectedPlaceholders.size != this.placeholders.length) {
      findings.errors.push(AnalysisError({
        message:
          `The structure expected ${expectedPlaceholders.size} placeholders but ${this.placeholders.length} were supplied.`,
        beginHighlight: DummyAstNode
          .fromToken(this.placeholders.at(0) ?? this.name),
        endHighlight: Some(this.placeholders.at(-1))
          .map(DummyAstNode.fromToken),
      }));
    }
    for (
      let index = 0;
      index <
        Math.min(expectedFieldTypes.length, foundFieldTypes.length);
      index += 1
    ) {
      const expectedParameterType = expectedFieldTypes[index];
      const foundParameterType = foundFieldTypes[index];
      if (!expectedParameterType.typeCompatibleWith(foundParameterType)) {
        findings.errors.push(AnalysisError({
          message:
            `Type '${foundParameterType.displayName()}' is incompatible with '${expectedParameterType.displayName()}'.`,
          beginHighlight: foundFields[index],
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
    const calledSymbol = analysisTable.findSymbol(this.name.text);
    const [isFunction, symbolExists] = calledSymbol
      .map((symbol) => [symbol.valueType.isFunction(), true])
      .unwrapOr([false, false]);
    const calledType = typeTable.findType(this.name.text);
    const isType = calledType.hasValue();
    if (symbolExists && isType) {
      throw new InternalError(
        `Encountered a type and a symbol with the same name ('${this.name.text}')`,
      );
    }
    if (!symbolExists && !isType) {
      findings.errors.push(AnalysisError({
        message:
          `Unable to resolve type or symbol by the name '${this.name.text}'.`,
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
      }));
    }
    if (symbolExists && !isFunction) {
      findings.errors.push(AnalysisError({
        message:
          `Cannot invoke '${this.name.text}' because it is neither a function nor a type.`,
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
      }));
    }
    if (isFunction && !findings.isErroneous()) {
      findings = AnalysisFindings.merge(
        findings,
        this.analyzeFunctionInvocation(
          calledSymbol.unwrap() as StaticSymbol<FunctionSymbolType>,
        ),
      );
    }
    if (isType && !findings.isErroneous()) {
      findings = AnalysisFindings.merge(
        findings,
        this.analyzeStructureInvocation(
          calledType.unwrap() as CompositeSymbolType,
        ),
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

  evaluateStructure(
    structureType: CompositeSymbolType,
  ): SymbolValue<unknown> {
    const instantiatedFields = new Map<string, [SymbolValue, SymbolType]>(
      Array.from(
        structureType.fields,
        ([name, type], index) => {
          return [name, [this.parameters[index].evaluate(), type]];
        },
      ),
    );
    return new CompositeSymbolValue({
      fields: instantiatedFields,
      id: this.name.text,
    });
  }

  evaluate(): SymbolValue<unknown> {
    const calledSymbol = runtimeTable.findSymbol(this.name.text);
    if (calledSymbol.hasValue()) {
      return this.evaluateFunction(
        calledSymbol.unwrap() as RuntimeSymbol<FunctionSymbolValue>,
      );
    }
    const calledStructure = typeTable.findType(this.name.text);
    return this.evaluateStructure(
      calledStructure.unwrap() as CompositeSymbolType,
    );
  }

  resolveType(): SymbolType {
    return analysisTable
      .findSymbol(this.name.text)
      .map((symbol) => symbol.valueType)
      .unwrapOrElse(
        typeTable.findType(this.name.text).unwrap,
      );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingParenthesis];
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

invocation.setPattern(apply(
  seq(
    tok(TokenKind.ident),
    opt_sc(starts_with_breaking_whitespace(placeholders)),
    surround_with_breaking_whitespace(str("(")),
    opt(parameters),
    starts_with_breaking_whitespace(str(")")),
  ),
  ([name, placeholders, openParenthesis, parameters, closingParenthesis]) =>
    new InvocationAstNode({
      name: name,
      parameters: parameters ?? [],
      placeholders: placeholders ?? [],
      openParenthesis: openParenthesis,
      closingParenthesis: closingParenthesis,
    }),
));
