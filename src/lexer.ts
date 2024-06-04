import { buildLexer, Token } from "typescript-parsec";
import { InternalError } from "./util/error.ts";

export enum TokenKind {
  breakingWhitespace,
  whitespace,
  numericLiteral,
  booleanLiteral,
  keyword,
  ident,
  standalonePunctuation,
  punctuation,
  string,
  unspecified,
}

const lexer = buildLexer([
  [true, /^\s*\n\s*/g, TokenKind.breakingWhitespace],
  [false, /^\s+/g, TokenKind.whitespace],
  [true, /^[0-9]+(\.[0-9]+)?/g, TokenKind.numericLiteral],
  [true, /^(false|true)/g, TokenKind.booleanLiteral],
  [true, /^(function|structure|use|if|else|while)/g, TokenKind.keyword],
  [true, /^[_A-Za-z]+[\-_0-9A-Za-z]*/g, TokenKind.ident],
  [true, /^[{}()]/g, TokenKind.standalonePunctuation],
  [true, /^[!@=<>#$%^&*_+\[\]:;\|,.?~\\/\-]+/g, TokenKind.punctuation],
  [true, /^"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, TokenKind.string],
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
