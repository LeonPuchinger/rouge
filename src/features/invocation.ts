import { apply, list_sc, opt, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { analysisTable, SymbolValue } from "../symbol.ts";
import { SymbolType, typeTable } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/option.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { invocation } from "./parser_declarations.ts";

/* AST NODES */

export class InvocationAstNode implements EvaluableAstNode {
  name!: Token<TokenKind>;
  parameters!: ExpressionAstNode[];
  closingParenthesis!: Token<TokenKind>;

  constructor(params: Attributes<InvocationAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): SymbolValue<unknown> {
    throw new Error("Method not implemented.");
  }

  resolveType(): SymbolType {
    throw new Error("Method not implemented.");
  }

  analyzeFunctionInvocation(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  analyzeStructureInvocation(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  analyze(): AnalysisFindings {
    let findings = this.parameters
      .map((parameter) => parameter.analyze())
      .reduce((previous, current) => AnalysisFindings.merge(previous, current));
    const [isFunction, symbolExists] = analysisTable
      .findSymbol(this.name.text)
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
        this.analyzeFunctionInvocation(),
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
  ([name, _, parameters, closingParenthesis]) =>
    new InvocationAstNode({
      name: name,
      parameters: parameters ?? [],
      closingParenthesis: closingParenthesis,
    }),
));
