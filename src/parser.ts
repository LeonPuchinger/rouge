import {
  alt_sc,
  apply,
  expectEOF,
  list_sc,
  seq,
  tok,
  Token,
} from "typescript-parsec";
import * as ast from "./ast.ts";
import * as interpreter from "./interpreter.ts";
import { TokenType } from "./lexer.ts";
import { AppError, InternalError, Panic } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";
import { toMultiline } from "./util/string.ts";

const BREAKING_WHITESPACE = tok(TokenType.breaking_whitespace);

const IDENTIFIER = apply(
  tok(TokenType.ident),
  (token): ast.IdentifierAstNode => ({
    token: token,
    value: token.text,
  }),
);

const INT_LITERAL = apply(
  tok(TokenType.int_literal),
  (token): ast.IntegerAstNode => ({
    token: token,
    value: parseInt(token.text),
  }),
);

const ASSIGNMENT = apply(
  seq(
    IDENTIFIER,
    tok(TokenType.eq_operator),
    INT_LITERAL,
  ),
  (values): ast.AssignAstNode => ({
    lhs: values[0],
    rhs: values[2],
    interpret: interpreter.handleAssign,
  }),
);

const EXPRESSION = apply(
  ASSIGNMENT, // TODO: replace with alt_sc when implementing further assignments
  (expression): ast.ExpressionAstNode => expression,
);

const EXPRESSIONS = apply(
  list_sc(
    EXPRESSION,
    BREAKING_WHITESPACE,
  ),
  (expressions): ast.ExpressionsAstNode => ({
    children: expressions,
  }),
);

export const START = EXPRESSIONS;

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
