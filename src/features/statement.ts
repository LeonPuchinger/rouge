import { alt_sc, apply, list_sc, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "../util/error.ts";
import { Attributes } from "../util/type.ts";
import { assignment, AssignmentAstNode } from "./assignment.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
// required for extension methods to be usable
import {} from "../util/array.ts";

/* AST NODES */

export type StatementAstNode =
  | ExpressionAstNode
  | AssignmentAstNode;

export class StatementsAstNode implements InterpretableAstNode {
  children!: StatementAstNode[];

  constructor(params: Attributes<StatementsAstNode>) {
    Object.assign(this, params);
  }

  interpret(): void {
    this.children.forEach((child) => {
      child.interpret();
    });
  }

  analyze(): AnalysisFindings {
    return this.children
      .map((statement) => statement.analyze())
      .reduce((previous, current) => AnalysisFindings.merge(previous, current));
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
