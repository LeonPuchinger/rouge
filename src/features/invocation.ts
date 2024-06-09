import { apply, list_sc, opt, seq, str, tok, Token } from "typescript-parsec";
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
import { expression, ExpressionAstNode } from "./expression.ts";
import { invocation } from "./parser_declarations.ts";

/* AST NODES */

export class InvocationAstNode implements EvaluableAstNode {
  keyword!: Token<TokenKind>;
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

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.closingParenthesis];
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
  ([keyword, _, parameters, closingParenthesis]) =>
    new InvocationAstNode({
      keyword: keyword,
      parameters: parameters ?? [],
      closingParenthesis: closingParenthesis,
    }),
));
