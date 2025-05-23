import { alt_sc, apply, list_sc, opt_sc, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "../util/error.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { assignment, AssignmentAstNode } from "./assignment.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
// required for extension methods to be usable
import { ExecutionEnvironment } from "../execution.ts";
import { RuntimeStatementAstNode } from "../runtime.ts";
import {} from "../util/array.ts";
import { ConditionAstNode } from "./condition.ts";
import { ReturnStatementAstNode } from "./function.ts";
import {
  controlFlowModifier,
  ControlFlowModifierAstNode,
  LoopAstNode,
} from "./loop.ts";
import {
  condition,
  loop,
  returnStatement,
  statements,
} from "./parser_declarations.ts";
import { typeDefinition, TypeDefinitionAstNode } from "./type_definition.ts";

/* AST NODES */

export type StatementAstNode =
  | ExpressionAstNode
  | ConditionAstNode
  | ReturnStatementAstNode
  | TypeDefinitionAstNode
  | AssignmentAstNode
  | RuntimeStatementAstNode
  | LoopAstNode
  | ControlFlowModifierAstNode;

export class StatementsAstNode implements InterpretableAstNode {
  children!: StatementAstNode[];

  constructor(params: Omit<Attributes<StatementsAstNode>, "config">) {
    Object.assign(this, params);
  }

  interpret(environment: ExecutionEnvironment): void {
    this.children.forEach((child) => child.interpret(environment));
  }

  get_representation(environment: ExecutionEnvironment): string {
    return this.children
      .map((child) => child.get_representation(environment))
      .join(",\n");
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = this.children
      .map((statement) => statement.analyze(environment))
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    if (this.children.length <= 0) {
      throw new InternalError(
        "Tried to request the token range for a StatementsAstNode which had no children.",
        "StatementsAstNodes have to have at least one child in order to generate a token range.",
      );
    }
    return [
      this.children[0].tokenRange()[0],
      this.children.last().tokenRange()[1],
    ];
  }
}

/* PARSER */

const statement = alt_sc(
  assignment,
  returnStatement,
  controlFlowModifier,
  condition,
  loop,
  typeDefinition,
  expression,
);

statements.setPattern(
  apply(
    opt_sc(
      list_sc(
        statement,
        tok(TokenKind.breakingWhitespace),
      ),
    ),
    (statements) => new StatementsAstNode({ children: statements ?? [] }),
  ),
);

export const globalStatements = surround_with_breaking_whitespace(statements);
