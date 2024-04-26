import { apply, kmid, seq, str, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { statements, StatementsAstNode } from "./statement.ts";

/* AST NODES */

class ConditionAstNode implements EvaluableAstNode {
  ifKeyword!: Token<TokenKind>;
  condition!: ExpressionAstNode;
  trueStatements!: StatementsAstNode;

  constructor(params: Attributes<ConditionAstNode>) {
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

export const condition = apply(
  seq(
    str<TokenKind>("if"),
    kmid(
      surround_with_breaking_whitespace(str("(")),
      surround_with_breaking_whitespace(expression),
      surround_with_breaking_whitespace(str(")")),
    ),
    kmid(
      surround_with_breaking_whitespace(str("{")),
      surround_with_breaking_whitespace(statements),
      surround_with_breaking_whitespace(str("}")),
    ),
  ),
  ([ifKeyword, condition, trueStatements]) =>
    new ConditionAstNode({
      ifKeyword: ifKeyword,
      condition: condition,
      trueStatements: trueStatements,
    }),
);
