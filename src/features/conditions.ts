import { apply, kmid, kright, seq, str, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { None } from "../util/monad/option.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { BooleanExpressionAstNode } from "./boolean_expression.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { statements, StatementsAstNode } from "./statement.ts";

/* AST NODES */

class ConditionAstNode implements InterpretableAstNode {
  ifKeyword!: Token<TokenKind>;
  condition!: ExpressionAstNode;
  trueStatements!: StatementsAstNode;
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<ConditionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    const conditionFindings = this.condition.analyze();
    const findings = AnalysisFindings.merge(
      conditionFindings,
      this.trueStatements.analyze(),
    );
    if (conditionFindings.isErroneous()) {
      return findings;
    }
    const conditionType = this.condition.resolveType();
    if (!conditionType.isPrimitive("boolean")) {
      findings.errors.push(AnalysisError({
        message:
          "The expression inside of the if statement needs to evaluate to a boolean value.",
        beginHighlight: this.condition,
        endHighlight: None(),
      }));
    }
    return findings;
  }

  interpret(): void {
    const conditionResult = (this.condition as BooleanExpressionAstNode)
      .evaluate();
    if (conditionResult.value) {
      this.trueStatements.interpret();
    }
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.ifKeyword, this.closingBrace];
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
    kright(
      surround_with_breaking_whitespace(str("{")),
      surround_with_breaking_whitespace(statements),
    ),
    surround_with_breaking_whitespace(str("}")),
  ),
  ([ifKeyword, condition, trueStatements, closingBrace]) =>
    new ConditionAstNode({
      ifKeyword: ifKeyword,
      condition: condition,
      trueStatements: trueStatements,
      closingBrace: closingBrace,
    }),
);
