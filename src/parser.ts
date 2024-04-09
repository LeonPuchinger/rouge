import { alt_sc, apply, expectEOF, Token } from "typescript-parsec";
import * as analysis from "./analysis.ts";
import * as ast from "./ast.ts";
import { booleanExpression } from "./features/boolean_expression.ts";
import { symbolExpression } from "./features/expression.ts";
import { numericExpression } from "./features/numeric_expression.ts";
import * as interpreter from "./interpreter.ts";
import { TokenKind } from "./lexer.ts";
import { InternalError } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { toMultiline } from "./util/string.ts";
import { statements } from "./features/statement.ts";

export const expression = apply(
  alt_sc(
    booleanExpression,
    numericExpression,
    symbolExpression,
  ),
  (expression: ast.EvaluableAstNode): ast.ExpressionAstNode => ({
    ...expression,
    interpret() {
      return interpreter.interpretExpression(this);
    },
    check() {
      return analysis.checkExpression(this);
    },
  }),
);

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
export function parse(tokenStream: Token<TokenKind>): ast.AST {
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
