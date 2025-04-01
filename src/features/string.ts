import {
  alt_sc,
  apply,
  opt_sc,
  rep_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import {
  AnalysisError,
  AnalysisFindings,
  AnalysisWarning,
} from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { StringSymbolValue } from "../symbol.ts";
import {
  CompositeSymbolType,
  FundamentalSymbolTypeKind,
  SymbolType,
} from "../type.ts";
import { InternalError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None, Some } from "../util/monad/option.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { complexStringLiteral } from "./parser_declarations.ts";
import { rep_at_least_once_sc } from "../util/parser.ts";
import { Option } from "../main.ts";
import { DummyAstNode } from "../util/snippet.ts";

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
  expression!: Option<EvaluableAstNode>;
  endDelimiter!: Token<TokenKind>;

  constructor(params: WithOptionalAttributes<StringInterpolationAstNode>) {
    Object.assign(this, params);
    this.expression = Some(params.expression);
  }

  evaluate(): StringSymbolValue {
    // analysis guarantees that the result of the expression
    // can be interpolated into a string.
    const contents = this.expression
      .map((node) => node.evaluate().value)
      .unwrapOr("");
    return new StringSymbolValue(`${contents}`);
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(): AnalysisFindings {
    const findings = this.expression
      .map((node) => node.analyze())
      .unwrapOr(AnalysisFindings.empty());
    if (findings.isErroneous()) {
      return findings;
    }
    if (!this.expression.hasValue()) {
      findings.warnings.push(
        AnalysisWarning({
          message: "Empty interpolations have no effect.",
          beginHighlight: DummyAstNode.fromToken(this.beginDelimiter),
          endHighlight: Some(DummyAstNode.fromToken(this.endDelimiter)),
          messageHighlight: "",
        }),
      );
    }
    const fundamentalTypeIds: FundamentalSymbolTypeKind[] = [
      "Boolean",
      "Number",
      "String",
    ];
    const expressionIsFundamental = fundamentalTypeIds.map(
      (id) => {
        return this.expression
          .map((node) => node.resolveType())
          .map((type) => type.isFundamental(id))
          .unwrapOr(true);
      },
    );
    if (!expressionIsFundamental) {
      findings.errors.push(
        AnalysisError({
          message: "Only fundamental types can be interpolated in a string.",
          beginHighlight: this.expression.unwrap(),
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
  rep_at_least_once_sc(tok(TokenKind.stringContents)),
  (token) => new StringContentsAstNode({ contents: token }),
);

const stringInterpolation = apply(
  seq(
    str<TokenKind>("${"),
    opt_sc(expression),
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
