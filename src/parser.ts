import {
  alt_sc,
  apply,
  expectEOF,
  list_sc,
  seq,
  tok,
  Token,
} from "typescript-parsec";
import * as analysis from "./analysis.ts";
import * as ast from "./ast.ts";
import * as interpreter from "./interpreter.ts";
import { TokenType } from "./lexer.ts";
import { symbolExpression } from "./parser/expression.ts";
import { numericExpression } from "./parser/numeric_expression.ts";
import { AppError, InternalError, Panic } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";
import { toMultiline } from "./util/string.ts";

const BREAKING_WHITESPACE = tok(TokenType.breaking_whitespace);

const EXPRESSION = apply(
  alt_sc(
    symbolExpression,
    numericExpression,
  ),
  (expression): ast.ExpressionAstNode => ({
    ...expression,
    interpret() {
      return interpreter.interpretExpression(this);
    },
    check() {
      return analysis.checkExpression(this);
    },
  }),
);

const ASSIGNMENT = apply(
  seq(
    tok(TokenType.ident),
    tok(TokenType.eq_operator),
    EXPRESSION,
  ),
  (values): ast.AssignAstNode => ({
    token: values[0],
    child: values[2],
    interpret() {
      return interpreter.interpretAssign(this);
    },
    check() {
      return analysis.checkAssign(this);
    },
  }),
);

const STATEMENT = apply(
  alt_sc(
    ASSIGNMENT,
    EXPRESSION,
  ),
  (statement): ast.StatementAstNode => statement,
);

const STATEMENTS = apply(
  list_sc(
    STATEMENT,
    BREAKING_WHITESPACE,
  ),
  (statements): ast.StatementAstNodes => ({
    children: statements,
    interpret() {
      return interpreter.interpretStatements(this);
    },
    check() {
      return analysis.checkStatements(this);
    },
  }),
);

export const START = STATEMENTS;

/**
 * Parse a sequence of tokens into an AST based the grammar of the language.
 *
 * @param tokenStream A linked list of tokens to parse
 * @returns An abstract syntax tree that has not been semantically analyzed yet
 */
export function parse(
  tokenStream: Token<TokenType>,
): Result<ast.AST, AppError> {
  const parseResult = expectEOF(START.parse(tokenStream));
  if (!parseResult.successful) {
    const parseError = parseResult.error;
    // TODO: replace with different error type that shows a snippet, e.g. InterpreterError
    return Err(InternalError(toMultiline(
      "Encountered Syntax Error:",
      parseError.message,
    )));
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates < 1) {
    throw Panic(
      "Parsing was successful but the parser did not yield any results",
    );
  }
  if (numberCandidates > 1) {
    logger.debug(toMultiline(
      "Ambiguity detected",
      `There are ${numberCandidates} ways to parse the input.`,
      "The first possible AST is used.",
      "Use the debugger to inspect other ways the input can be interpreted by the parser.",
    ));
  }
  const ast = parseResult.candidates[0].result;
  return Ok(ast);
}
