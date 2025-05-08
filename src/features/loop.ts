import { apply, kmid, kright, seq, str, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { None } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { BooleanExpressionAstNode } from "./boolean_expression.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { loop, statements } from "./parser_declarations.ts";
import { StatementsAstNode } from "./statement.ts";

/* AST NODES */

export class LoopAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  condition!: ExpressionAstNode;
  statements!: StatementsAstNode;
  closingBrace!: Token<TokenKind>;

  constructor(params: WithOptionalAttributes<LoopAstNode>) {
    Object.assign(this, params);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    environment.analysisTable.pushScope();
    const conditionFindings = this.condition.analyze(environment);
    const statementsFindings = this.statements.analyze(environment);
    environment.analysisTable.popScope();
    const findings = AnalysisFindings.merge(
      conditionFindings,
      statementsFindings,
    );
    if (conditionFindings.isErroneous()) {
      return findings;
    }
    const conditionType = this.condition.resolveType(environment);
    if (!conditionType.isFundamental("Boolean")) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "The expression inside of the loop needs to evaluate to a boolean value.",
        beginHighlight: this.condition,
        endHighlight: None(),
      }));
    }
    return findings;
  }

  interpret(environment: ExecutionEnvironment): void {
    environment.runtimeTable.pushScope();
    const conditionResult = (this.condition as BooleanExpressionAstNode)
      .evaluate(environment);
    if (conditionResult.value) {
      this.statements.interpret(environment);
      environment.runtimeTable.popScope();
    } else {
      environment.runtimeTable.popScope();
      environment.runtimeTable.pushScope();
      this.falseStatements.then((statements) =>
        statements.interpret(environment)
      );
      environment.runtimeTable.popScope();
    }
  }

  get_representation(environment: ExecutionEnvironment): string {
    this.interpret(environment);
    return "Nothing";
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.closingBrace];
  }
}

/* PARSER */

loop.setPattern(
  apply(
    seq(
      str<TokenKind>("while"),
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
    ),
    ([keyword, condition, statements, closingBrace]) => {
      return new LoopAstNode({
        keyword,
        condition,
        statements,
        closingBrace,
      });
    },
  ),
);
