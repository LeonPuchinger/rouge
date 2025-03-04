import { alt_sc, apply, rep_sc, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { StringSymbolValue } from "../symbol.ts";
import { CompositeSymbolType, SymbolType } from "../type.ts";
import { memoize } from "../util/memoize.ts";
import { Attributes } from "../util/type.ts";
import { expression } from "./expression.ts";

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
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.literal, this.literal];
  }
}

class StringInterpolationAstNode implements EvaluableAstNode {
  beginningSymbol!: Token<TokenKind>;
  expression!: EvaluableAstNode;
  closingSymbol!: Token<TokenKind>;

  constructor(params: Attributes<StringInterpolationAstNode>) {
    Object.assign(this, params);
  }

  @memoize
  evaluate(): StringSymbolValue {
    // remove quotation marks which are part of the literal
    const contents = this.literal.text.slice(1, -1);
    return new StringSymbolValue(contents);
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.beginningSymbol, this.closingSymbol];
  }
}

class ComplexStringAstNode implements EvaluableAstNode {
  openingQuotation!: Token<TokenKind>;
  contents!: EvaluableAstNode[];
  closingQuotation!: Token<TokenKind>;

  constructor(params: Attributes<ComplexStringAstNode>) {
    Object.assign(this, params);
  }

  @memoize
  evaluate(): StringSymbolValue {
    // remove quotation marks which are part of the literal
    const contents = this.literal.text.slice(1, -1);
    return new StringSymbolValue(contents);
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.openingQuotation, this.closingQuotation];
  }
}

/* PARSER */

export const stringLiteral = apply(
  tok(TokenKind.string),
  (token) => new StringAstNode({ literal: token }),
);

const stringContents = apply(
  tok(TokenKind.unspecified),
  (token) => new StringAstNode({ literal: token }),
);

const interpolation = apply(
  seq(
    str<TokenKind>("$"),
    str("{"),
    expression,
    str<TokenKind>("}"),
  ),
  ([beginningSymbol, _, expression, closingSymbol]) =>
    new StringInterpolationAstNode({
      beginningSymbol,
      expression,
      closingSymbol,
    }),
);

export const complexStringLiteral = apply(
  seq(
    str<TokenKind>('"'),
    rep_sc(
      alt_sc(
        stringContents,
        interpolation,
      ),
    ),
    str<TokenKind>('"'),
  ),
  ([openingQuotation, contents, closingQuotation]) =>
    new ComplexStringAstNode({
      openingQuotation,
      contents,
      closingQuotation,
    }),
);
