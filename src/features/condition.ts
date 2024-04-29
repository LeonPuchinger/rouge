import { apply, kmid, kright, opt, seq, str, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { None } from "../util/monad/option.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { BooleanExpressionAstNode } from "./boolean_expression.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { statements, StatementsAstNode } from "./statement.ts";
import { starts_with_breaking_whitespace } from "../util/parser.ts";
import { ends_with_breaking_whitespace } from "../util/parser.ts";

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

const elseBranch = kright(
  seq(
    str<TokenKind>("else"),
    surround_with_breaking_whitespace(str("{")),
  ),
  seq(
    statements,
    starts_with_breaking_whitespace(str("}")),
  ),
);

export const condition = apply(
  seq(
    str<TokenKind>("if"),
    kmid(
      surround_with_breaking_whitespace(str("(")),
      expression,
      surround_with_breaking_whitespace(str(")")),
    ),
    kright(
      ends_with_breaking_whitespace(str("{")),
      statements,
    ),
    surround_with_breaking_whitespace(str("}")),
    opt(elseBranch),
  ),
  ([ifKeyword, condition, trueStatements, closingBrace]) =>
    new ConditionAstNode({
      ifKeyword: ifKeyword,
      condition: condition,
      trueStatements: trueStatements,
      closingBrace: closingBrace,
    }),
);
