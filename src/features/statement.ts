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
import { RuntimeStatementAstNode } from "../runtime.ts";
import {} from "../util/array.ts";
import { ConditionAstNode } from "./condition.ts";
import { ReturnStatementAstNode } from "./function.ts";
import {
  condition,
  returnStatement,
  statements,
} from "./parser_declarations.ts";
import { structureDefinition, StructureDefinitonAstNode } from "./structure.ts";

/* AST NODES */

export type StatementAstNode =
  | ExpressionAstNode
  | ConditionAstNode
  | ReturnStatementAstNode
  | StructureDefinitonAstNode
  | AssignmentAstNode
  | RuntimeStatementAstNode;

export class StatementsAstNode implements InterpretableAstNode {
  children!: StatementAstNode[];

  constructor(params: Omit<Attributes<StatementsAstNode>, "config">) {
    Object.assign(this, params);
  }

  interpret(): void {
    this.children.forEach((child) => child.interpret());
  }

  analyze(): AnalysisFindings {
    const findings = this.children
      .map((statement) => statement.analyze())
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
  condition,
  returnStatement,
  structureDefinition,
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
