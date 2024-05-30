import { expectEOF, Token } from "typescript-parsec";
import { AST } from "./ast.ts";
import { globalStatements } from "./features/statement.ts";
import { TokenKind } from "./lexer.ts";
import { InternalError, RuntimeError } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { DummyAstNode } from "./util/snippet.ts";
import { toMultiline } from "./util/string.ts";

// required to initialize parsers declared in `parser_declarations`
import "./features/condition.ts";
import "./features/function.ts";

/**
 * Top level production/entry point to the parser
 */
export const start = globalStatements;

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
    throw new RuntimeError({
      message: "Encountered syntax error.",
      include: [DummyAstNode.fromTokenPosition(parseError.pos!)],
      highlight: [DummyAstNode.fromTokenPosition(parseError.pos!)],
      highlightMessage: parseError.message,
    });
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
