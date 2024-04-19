import { expectEOF, Token } from "typescript-parsec";
import { AST } from "./ast.ts";
import { statements } from "./features/statement.ts";
import { TokenKind } from "./lexer.ts";
import { InternalError } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { toMultiline } from "./util/string.ts";

/**
 * Top level production/entry point to the parser
 */
export const start = statements;

/**
 * Parse a sequence of tokens into an AST based the grammar of the language.
 *
 * @param tokenStream A linked list of tokens to parse
 * @returns An abstract syntax tree that has not been semantically analyzed yet
 */
export function parse(tokenStream: Token<TokenKind>): AST {
  const parseResult = expectEOF(start.parse(tokenStream));
  if (!parseResult.successful) {
    const parseError = parseResult.error;
    // TODO: replace with different error type that shows a snippet, e.g. InterpreterError
    throw new InternalError(toMultiline(
      "Encountered Syntax Error:",
      parseError.message,
    ));
  }
  const numberCandidates = parseResult.candidates.length;
  if (numberCandidates < 1) {
    throw new InternalError(
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
  return ast;
}
