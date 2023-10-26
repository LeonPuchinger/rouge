import { buildLexer, Token } from "typescript-parsec";
import { AppError, InternalError } from "./util/error.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";

export enum TokenType {
  breaking_whitespace,
  whitespace,
  eq_operator,
  int_literal,
  ident,
}

export const lexer = buildLexer([
  [true, /^\s*\n\s*/g, TokenType.breaking_whitespace],
  [false, /^\s+/g, TokenType.whitespace],
  [true, /^=/g, TokenType.eq_operator],
  [true, /^[0-9]+/g, TokenType.int_literal],
  [true, /^[_A-Za-z]+[\-_0-9A-Za-z]*/g, TokenType.ident],
]);

/**
 * Split an input string into a sequence of Tokens.
 * 
 * @param source The input souce code
 * @returns A linked list of Tokens
 */
export function tokenize(source: string): Result<Token<TokenType>, AppError> {
  const tokenStream = lexer.parse(source);
  if (tokenStream === undefined) {
    return Err(InternalError(
      "The tokenizer did not emit any tokens",
    ));
  }
  return Ok(tokenStream);
}
