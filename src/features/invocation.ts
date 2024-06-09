import { apply, list_sc, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { invocation } from "./parser_declarations.ts";

/* AST NODES */

export class InvocationAstNode implements EvaluableAstNode {
  keyword!: Token<TokenKind>;
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

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    throw new Error("Method not implemented.");
  }
}

/* PARSER */

const parameters = list_sc(
  expression,
  str(","),
);

invocation.setPattern(apply(
  seq(
    tok(TokenKind.ident),
    surround_with_breaking_whitespace(str("(")),
    parameters,
    starts_with_breaking_whitespace(str(")")),
  ),
  ([keyword, _, params, closingParenthesis]) =>
    new InvocationAstNode({
      keyword: keyword,
      closingParenthesis: closingParenthesis,
    }),
));
