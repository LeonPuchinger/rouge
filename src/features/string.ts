import { apply, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { StringSymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { memoize } from "../util/memoize.ts";
import { Attributes } from "../util/type.ts";
import { PrimitiveSymbolType } from "../type.ts";

/* AST NODES */

class StringAstNode implements EvaluableAstNode {
  literal!: Token<TokenKind>;

  constructor(params: Attributes<StringAstNode>) {
    Object.assign(this, params);
  }

  @memoize
  evaluate(): StringSymbolValue {
    // remove quotation marks which are part of the literal
    const contents = this.literal.text.slice(1, -1);
    return new StringSymbolValue(contents);
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("String");
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.literal, this.literal];
  }
}

/* PARSER */

export const stringLiteral = apply(
  tok(TokenKind.string),
  (token) => new StringAstNode({ literal: token }),
);
