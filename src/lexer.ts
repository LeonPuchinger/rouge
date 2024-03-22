import { buildLexer, Token } from "typescript-parsec";
import { InternalError } from "./util/error.ts";

export enum TokenType {
  breaking_whitespace,
  whitespace,
  numeric_literal,
  boolean_literal,
  keyword,
  ident,
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
  [true, /^[!@=<>{}()#$%^&*_+\[\]:;\|,.?~\\/\-]+/g, TokenType.punctuation],
  [true, /^\S/g, TokenType.unspecified],
]);

/**
 * Split an input string into a sequence of Tokens.
 *
 * @param source The input souce code
 * @returns A linked list of Tokens
 */
export function tokenize(source: string): Token<TokenType> {
  const tokenStream = lexer.parse(source);
  if (tokenStream === undefined) {
    throw new InternalError("The tokenizer did not emit any tokens");
  }
  return tokenStream;
}
