import { buildLexer, Token } from "typescript-parsec";
import { InternalError } from "./util/error.ts";

export enum TokenKind {
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
  [true, /^\s*\n\s*/g, TokenKind.breaking_whitespace],
  [false, /^\s+/g, TokenKind.whitespace],
  [true, /^[0-9]+(\.[0-9]+)?/g, TokenKind.numeric_literal],
  [true, /^(false|true)/g, TokenKind.boolean_literal],
  [true, /^function|structure|use|if|else|while/g, TokenKind.keyword],
  [true, /^[_A-Za-z]+[\-_0-9A-Za-z]*/g, TokenKind.ident],
  [true, /^[!@=<>{}()#$%^&*_+\[\]:;\|,.?~\\/\-]+/g, TokenKind.punctuation],
  [true, /^\S/g, TokenKind.unspecified],
]);

/**
 * Split an input string into a sequence of Tokens.
 *
 * @param source The input souce code
 * @returns A linked list of Tokens
 */
export function tokenize(source: string): Token<TokenKind> {
  const tokenStream = lexer.parse(source);
  if (tokenStream === undefined) {
    throw new InternalError("The tokenizer did not emit any tokens");
  }
  return tokenStream;
}
