import {
  apply,
  kmid,
  kright,
  opt_sc,
  seq,
  str,
  Token,
} from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { None, Option } from "../util/monad/index.ts";
import { Some } from "../util/monad/option.ts";
import {
  ends_with_breaking_whitespace,
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { BooleanExpressionAstNode } from "./boolean_expression.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { condition, statements } from "./parser_declarations.ts";
import { StatementsAstNode } from "./statement.ts";

/* AST NODES */

export class ConditionAstNode implements InterpretableAstNode {
  ifKeyword!: Token<TokenKind>;
  condition!: ExpressionAstNode;
  trueStatements!: StatementsAstNode;
  falseStatements!: Option<StatementsAstNode>;
  ifClosingBrace!: Token<TokenKind>;
  elseClosingBrace!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<ConditionAstNode>) {
    Object.assign(this, params);
    this.falseStatements = Some(params.falseStatements);
    this.elseClosingBrace = Some(params.elseClosingBrace);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    environment.analysisTable.pushScope();
    const conditionFindings = this.condition.analyze(environment);
    const trueFindings = this.trueStatements.analyze(environment);
    environment.analysisTable.popScope();
    environment.analysisTable.pushScope();
    const findings = AnalysisFindings.merge(
      conditionFindings,
      trueFindings,
      this.falseStatements
        .map((statements) => statements.analyze(environment))
        .unwrapOr(AnalysisFindings.empty()),
    );
    environment.analysisTable.popScope();
    if (conditionFindings.isErroneous()) {
      return findings;
    }
    const conditionType = this.condition.resolveType(environment);
    if (!conditionType.isFundamental("Boolean")) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "The expression inside of the if statement needs to evaluate to a boolean value.",
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
      this.trueStatements.interpret(environment);
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

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [
      this.ifKeyword,
      this.elseClosingBrace.unwrapOr(this.ifClosingBrace),
    ];
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

condition.setPattern(
  apply(
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
      opt_sc(elseBranch),
    ),
    ([ifKeyword, condition, ifStatements, firstClosingBrace, elseBranch]) => {
      const [falseStatements, elseClosingBrace] = elseBranch ?? [];
      return new ConditionAstNode({
        ifKeyword: ifKeyword,
        condition: condition,
        trueStatements: ifStatements,
        ifClosingBrace: firstClosingBrace,
        falseStatements: falseStatements,
        elseClosingBrace: elseClosingBrace,
      });
    },
  ),
);
