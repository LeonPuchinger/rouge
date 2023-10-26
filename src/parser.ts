import { apply, list_sc, seq, tok, Token } from "typescript-parsec";
import { AstNode, AstNodeType } from "./ast.ts";
import { TokenType } from "./lexer.ts";
import { AppError, InternalError, Panic } from "./util/error.ts";
import * as logger from "./util/logger.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";
import { toMultiline } from "./util/string.ts";

const BREAKING_WHITESPACE = tok(TokenType.breaking_whitespace);

const IDENTIFIER = apply(
  tok(TokenType.ident),
  (token) =>
    new AstNode({
      nodeType: AstNodeType.ident,
      token: token,
      value: token.text,
    }),
);

const INT_LITERAL = apply(
  tok(TokenType.int_literal),
  (token) =>
    new AstNode({
      nodeType: AstNodeType.int_literal,
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
  (values) =>
    new AstNode({
      nodeType: AstNodeType.assign,
      children: [values[0], values[2]],
    }),
);

const EXPRESSION = ASSIGNMENT;

const EXPRESSIONS = apply(
  list_sc(
    EXPRESSION,
    BREAKING_WHITESPACE,
  ),
  (expressions) =>
    new AstNode({
      nodeType: AstNodeType.expressions,
      children: expressions,
    }),
);

export const START = EXPRESSIONS;

export function parse(
  tokenStream: Token<TokenType>,
): Result<AstNode, AppError> {
  const parseResult = START.parse(tokenStream);
  if (!parseResult.successful) {
    const parseError = parseResult.error;
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
