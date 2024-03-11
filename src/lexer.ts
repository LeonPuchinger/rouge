import { buildLexer, Token } from "typescript-parsec";
import { AppError, InternalError } from "./util/error.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";

export enum TokenType {
  breaking_whitespace,
  whitespace,
  numeric_literal,
  boolean_literal,
  keyword,
  ident,
  brackets,
  punctuation,
  unspecified,
}

const lexer = buildLexer([
  [true, /^\s*\n\s*/g, TokenType.breaking_whitespace],
  [false, /^\s+/g, TokenType.whitespace],
  [true, /^[0-9]+(\.[0-9]+)?/g, TokenType.numeric_literal],
  [true, /^(false|true)/g, TokenType.boolean_literal],
  [true, /^function|structure|use|if|else|while/g, TokenType.keyword],
  [true, /^[_A-Za-z]+[\-_0-9A-Za-z]*/g, TokenType.ident],
  [true, /^[{}()<>]/g, TokenType.brackets],
  [true, /^[!@=#$%^&*_+\[\]:;\|,.?~\\/\-]+/g, TokenType.punctuation],
  [true, /^\S/g, TokenType.unspecified],
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
    return Err(
      new InternalError(
        "The tokenizer did not emit any tokens",
      ),
    );
  }
  return Ok(tokenStream);
}
