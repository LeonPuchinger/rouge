import { alt_sc, apply, list_sc, Parser, tok } from "typescript-parsec";
import * as ast from "../ast.ts";
import { TokenKind } from "../lexer.ts";
import { expression } from "../parser.ts";
import { assignment } from "./assignment.ts";
import { AnalysisFindings } from "../finding.ts";

const statement: Parser<TokenKind, ast.StatementAstNode> = alt_sc(
  assignment,
  expression,
);

export const statements = apply(
  list_sc(
    statement,
    tok(TokenKind.breaking_whitespace),
  ),
  (statements): ast.StatementsAstNode => ({
    children: statements,
    interpret() {
      this.children.forEach((child) => {
        child.interpret();
      });
    },
    check() {
      return this.children
        .map((statement) => statement.check())
        .reduce((previous, current) =>
          AnalysisFindings.merge(previous, current)
        );
    },
  }),
);
