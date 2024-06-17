import { apply, list_sc, opt, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  FunctionSymbolValue,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
  SymbolValue,
} from "../symbol.ts";
import { FunctionSymbolType, SymbolType, typeTable } from "../type.ts";
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
  openParenthesis!: Token<TokenKind>;
  closingParenthesis!: Token<TokenKind>;

  constructor(params: Attributes<InvocationAstNode>) {
    Object.assign(this, params);
  }

  analyzeFunctionInvocation(
    functionSymbol: StaticSymbol<FunctionSymbolType>,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const expectedParameters = functionSymbol.valueType.parameters;
    const expectedParameterTypes = Object.values(expectedParameters);
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
          // TODO: resolve type name and add type names to the error message
          message:
            "The supplied value has a value that is incompatible with the required type",
          beginHighlight: foundParameters[index],
          endHighlight: None(),
        }));
      }
    }
    return findings;
  }

  analyzeStructureInvocation(): AnalysisFindings {
    return AnalysisFindings.empty();
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
    const isType = typeTable
      .findType(this.name.text)
      .hasValue();
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
        this.analyzeStructureInvocation(),
      );
    }
    return findings;
  }

  evaluateFunction(
    functionSymbol: RuntimeSymbol<FunctionSymbolValue>,
  ): SymbolValue<unknown> {
    runtimeTable.pushScope();
    const symbolType = functionSymbol.value.valueType as FunctionSymbolType;
    const parameterNames = Object.keys(symbolType.parameters);
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
    if (calledSymbol.hasValue()) {
      return this.evaluateFunction(
        calledSymbol.unwrap() as RuntimeSymbol<FunctionSymbolValue>,
      );
    }
    throw new Error("Method not implemented.");
  }

  resolveType(): SymbolType {
    const functionSymbol = analysisTable.findSymbol(this.name.text).unwrap();
    const functionType = functionSymbol.valueType as FunctionSymbolType;
    return functionType.returnType;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingParenthesis];
  }
}

/* PARSER */

const parameters = list_sc(
  expression,
  surround_with_breaking_whitespace(str(",")),
);

invocation.setPattern(apply(
  seq(
    tok(TokenKind.ident),
    surround_with_breaking_whitespace(str("(")),
    opt(parameters),
    starts_with_breaking_whitespace(str(")")),
  ),
  ([name, openParenthesis, parameters, closingParenthesis]) =>
    new InvocationAstNode({
      name: name,
      parameters: parameters ?? [],
      openParenthesis: openParenthesis,
      closingParenthesis: closingParenthesis,
    }),
));
