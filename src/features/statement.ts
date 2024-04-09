import { alt_sc, apply, list_sc, Parser, tok } from "typescript-parsec";
import {
  ExpressionAstNode,
  InterpretableAstNode,
  NaryAstNode,
} from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { expression } from "../parser.ts";
import { Attributes } from "../util/type.ts";
import { assignment, AssignmentAstNode } from "./assignment.ts";

/* AST NODES */

export type StatementAstNode =
  | ExpressionAstNode
  | AssignmentAstNode;

export class StatementsAstNode
  implements NaryAstNode<StatementAstNode>, InterpretableAstNode {
  children!: StatementAstNode[];

  constructor(params: Attributes<StatementsAstNode>) {
    Object.assign(this, params);
  }

  interpret(): void {
    this.children.forEach((child) => {
      child.interpret();
    });
  }

  check(): AnalysisFindings {
    return this.children
      .map((statement) => statement.check())
      .reduce((previous, current) => AnalysisFindings.merge(previous, current));
  }
}

/* PARSERS */

const statement = alt_sc(
  assignment,
  expression,
);

export const statements = apply(
  list_sc(
    statement,
    tok(TokenKind.breaking_whitespace),
  ),
  (statements) => new StatementsAstNode({ children: statements }),
);
