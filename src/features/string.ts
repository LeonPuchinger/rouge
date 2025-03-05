import { alt_sc, apply, rep_sc, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { StringSymbolValue } from "../symbol.ts";
import {
  CompositeSymbolType,
  FundamentalSymbolTypeKind,
  SymbolType,
} from "../type.ts";
import { memoize } from "../util/memoize.ts";
import { Attributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { complexStringLiteral } from "./parser_declarations.ts";
import { None } from "../util/monad/option.ts";

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

export class StringInterpolationAstNode implements EvaluableAstNode {
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
    const findings = this.expression.analyze();
    if (findings.isErroneous()) {
      return findings;
    }
    const fundamentalTypeIds: FundamentalSymbolTypeKind[] = [
      "Boolean",
      "Number",
      "String",
    ];
    const expressionIsFundamental = fundamentalTypeIds.map(
      (id) => this.expression.resolveType().isFundamental(id),
    );
    if (!expressionIsFundamental) {
      findings.errors.push(
        AnalysisError({
          message: "Only fundamental types can be interpolated in a string.",
          beginHighlight: this.expression,
          endHighlight: None(),
        }),
      );
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.beginningSymbol, this.closingSymbol];
  }
}

export class ComplexStringAstNode implements EvaluableAstNode {
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

const stringInterpolation = apply(
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

complexStringLiteral.setPattern(
  apply(
    seq(
      str<TokenKind>('"'),
      rep_sc(
        alt_sc(
          stringContents,
          stringInterpolation,
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
  ),
);
