import {
  alt_sc,
  apply,
  kmid,
  kright,
  seq,
  str,
  Token,
} from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
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
    environment.typeTable.pushScope({ loop: true });
    const conditionFindings = this.condition.analyze(environment);
    const statementsFindings = this.statements.analyze(environment);
    environment.typeTable.popScope();
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
    environment.typeTable.pushScope({ loop: true });
    try {
      const conditionTrue = () =>
        (this.condition as BooleanExpressionAstNode)
          .evaluate(environment).value;
      while (conditionTrue()) {
        environment.runtimeTable.pushScope();
        try {
          this.statements.interpret(environment);
        } catch (error) {
          if (error instanceof ControlFlowModifier) {
            if (error.modifier === "continue") {
              continue;
            }
            if (error.modifier === "break") {
              break;
            }
          }
          throw error;
        } finally {
          // Ensure that the scope is popped even if there was
          // a control flow modifier or a function return value.
          // Take a look at the implementation of conditions for
          // furhter explanation.
          environment.runtimeTable.popScope();
        }
      }
    } finally {
      // Ensure that the loop scope is always popped.
      // Take a look at the implementation of conditions for
      // furhter explanation.
      environment.typeTable.popScope();
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

/**
 * A custom error type that is NOT used for any actual error handling.
 * Statements inside of a loop can be nested to various degrees
 * (e.g. conditions, further loops). Therefore it can be difficult to receive
 * control flow modifiers (e.g. `continue`, `break`) as a caller.
 * This error is used to propagate the modifier commands back through the
 * call stack to the nearest loop, where it is caught.
 * The benefit of throwing an error is that execution of all nested
 * statements stops immediately without having to implement any further logic.
 */
export class ControlFlowModifier extends Error {
  constructor(public modifier: "continue" | "break") {
    super();
  }
}

export class ControlFlowModifierAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;

  constructor(params: Attributes<ControlFlowModifierAstNode>) {
    Object.assign(this, params);
  }

  kind(): "continue" | "break" {
    const allowedKeywords = ["continue", "break"];
    if (!allowedKeywords.includes(this.keyword.text)) {
      throw new InternalError(
        `Unrecognized control flow modifier "${this.keyword.text}".`,
        "This should have been caught by the parser.",
      );
    }
    return this.keyword.text as "continue" | "break";
  }

  interpret(_environment: ExecutionEnvironment): void {
    throw new ControlFlowModifier(this.kind());
  }

  get_representation(environment: ExecutionEnvironment): string {
    this.interpret(environment);
    return "Nothing";
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const currentlyInLoop = environment.typeTable.insideLoop();
    if (!currentlyInLoop) {
      findings.errors.push(AnalysisError(environment, {
        message:
          `Control flow modifiers such as "${this.kind()}" are only allowed inside of loops.`,
        beginHighlight: DummyAstNode.fromToken(this.keyword),
        endHighlight: None(),
      }));
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.keyword];
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
      starts_with_breaking_whitespace(str("}")),
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

export const controlFlowModifier = apply(
  alt_sc(
    str<TokenKind>("continue"),
    str<TokenKind>("break"),
  ),
  (keyword) => new ControlFlowModifierAstNode({ keyword }),
);
