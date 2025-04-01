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
import { InternalError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None } from "../util/monad/option.ts";
import { Attributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { complexStringLiteral } from "./parser_declarations.ts";

/* AST NODES */

class StringContentsAstNode implements EvaluableAstNode {
  contents!: Token<TokenKind>[];

  constructor(params: Attributes<StringContentsAstNode>) {
    if (params.contents.length === 0) {
      throw new InternalError(
        "StringContentsAstNode must consist of at least one token.",
      );
    }
    Object.assign(this, params);
  }

  @memoize
  evaluate(): StringSymbolValue {
    const concatenatedContents = this.contents
      .map((token) => token.text)
      .join("");
    return new StringSymbolValue(concatenatedContents);
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.contents[0], this.contents.toReversed()[0]];
  }
}

export class StringInterpolationAstNode implements EvaluableAstNode {
  beginDelimiter!: Token<TokenKind>;
  expression!: EvaluableAstNode;
  endDelimiter!: Token<TokenKind>;

  constructor(params: Attributes<StringInterpolationAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): StringSymbolValue {
    // analysis guarantees that the result of the expression
    // can be interpolated into a string.
    const contents = this.expression.evaluate().value;
    return new StringSymbolValue(`${contents}`);
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
    return [this.beginDelimiter, this.endDelimiter];
  }
}

export class ComplexStringAstNode implements EvaluableAstNode {
  openingQuotation!: Token<TokenKind>;
  contents!: EvaluableAstNode[];
  closingQuotation!: Token<TokenKind>;

  constructor(params: Attributes<ComplexStringAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): StringSymbolValue {
    const contents = this.contents
      .map((node) => node.evaluate().value)
      .join("");
    return new StringSymbolValue(contents);
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.merge(
      ...this.contents.map((node) => node.analyze()),
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.openingQuotation, this.closingQuotation];
  }
}

/* PARSER */

const stringContents = apply(
  rep_sc(tok(TokenKind.stringContents)),
  (token) => new StringContentsAstNode({ contents: token }),
);

const stringInterpolation = apply(
  seq(
    str<TokenKind>("${"),
    expression,
    str<TokenKind>("}"),
  ),
  ([beginDelimiter, expression, endDelimiter]) =>
    new StringInterpolationAstNode({
      beginDelimiter: beginDelimiter,
      expression,
      endDelimiter: endDelimiter,
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
