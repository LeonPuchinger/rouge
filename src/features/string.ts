import { apply, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

class StringAstNode implements EvaluableAstNode {
  literal!: Token<TokenKind>;

  constructor(params: Attributes<StringAstNode>) {
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

export const stringLiteral = apply(
  tok(TokenKind.string),
  (token) => new StringAstNode({ literal: token }),
);
