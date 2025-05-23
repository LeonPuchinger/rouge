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
import { ExecutionEnvironment } from "../execution.ts";
import {
  AnalysisError,
  AnalysisFindings,
  AnalysisWarning,
} from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { Option } from "../main.ts";
import { StringSymbolValue, SymbolFlags } from "../symbol.ts";
import {
  CompositeSymbolType,
  FundamentalSymbolTypeKind,
  SymbolType,
} from "../type.ts";
import { InternalError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None, Some } from "../util/monad/option.ts";
import { rep_at_least_once_sc } from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
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
  evaluate(_environment: ExecutionEnvironment): StringSymbolValue {
    const concatenatedContents = this.contents
      .map((token) => token.text)
      .join("");
    return new StringSymbolValue(concatenatedContents);
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(_environment: ExecutionEnvironment): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.contents[0], this.contents.toReversed()[0]];
  }

  resolveFlags(
    _environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return new Map();
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

  evaluate(environment: ExecutionEnvironment): StringSymbolValue {
    // analysis guarantees that the result of the expression
    // can be interpolated into a string.
    const contents = this.expression
      .map((node) => node.evaluate(environment).value)
      .unwrapOr("");
    return new StringSymbolValue(`${contents}`);
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = this.expression
      .map((node) => node.analyze(environment))
      .unwrapOr(AnalysisFindings.empty());
    if (findings.isErroneous()) {
      return findings;
    }
    if (!this.expression.hasValue()) {
      findings.warnings.push(
        AnalysisWarning(environment, {
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
    const expressionType = this.expression
      .map((node) => node.resolveType(environment));
    const expressionIsFundamental = fundamentalTypeIds
      .map((id) =>
        expressionType
          .map((type) => type.isFundamental(id))
          .unwrapOr(true)
      )
      .some((isFundamental) => isFundamental);
    if (!expressionIsFundamental) {
      findings.errors.push(
        AnalysisError(environment, {
          message: "Only fundamental types can be interpolated in a string.",
          beginHighlight: this.expression.unwrap(),
          endHighlight: None(),
          messageHighlight: `Type "${
            expressionType
              .map((type) => type.displayName())
              .unwrapOr("")
          }" cannot be used in a string interpolation.`,
        }),
      );
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.beginDelimiter, this.endDelimiter];
  }

  resolveFlags(
    _environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

export class ComplexStringAstNode implements EvaluableAstNode {
  openingQuotation!: Token<TokenKind>;
  contents!: EvaluableAstNode[];
  closingQuotation!: Token<TokenKind>;

  constructor(params: Attributes<ComplexStringAstNode>) {
    Object.assign(this, params);
  }

  evaluate(environment: ExecutionEnvironment): StringSymbolValue {
    const contents = this.contents
      .map((node) => node.evaluate(environment).value)
      .join("");
    return new StringSymbolValue(contents);
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "String" });
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    return AnalysisFindings.merge(
      ...this.contents.map((node) => node.analyze(environment)),
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.openingQuotation, this.closingQuotation];
  }

  resolveFlags(
    _environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return new Map();
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
