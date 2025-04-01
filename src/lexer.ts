import { buildLexer, LexerState, Token } from "typescript-parsec";
import { InternalError } from "./util/error.ts";

export enum TokenKind {
  breakingWhitespace,
  blockComment,
  lineComment,
  whitespace,
  numericLiteral,
  booleanLiteral,
  keyword,
  ident,
  single_line_arrow,
  standalonePunctuation,
  punctuation,
  stringContents,
  stringDelimiter,
  stringInterpolationDelimiter,
  unspecified,
}

const statements: LexerState<TokenKind> = [];
const stringLiteral: LexerState<TokenKind> = [];

statements.push(
  [false, /^\/\*(.|\n)*?\*\//gm, TokenKind.blockComment],
  [false, /^\/\/[^\n]*\n?/g, TokenKind.lineComment],
  [true, /^\s*\n\s*/g, TokenKind.breakingWhitespace],
  [false, /^\s+/g, TokenKind.whitespace],
  [true, /^[0-9]+(\.[0-9]+)?/g, TokenKind.numericLiteral],
  [true, /^(false|true)/g, TokenKind.booleanLiteral],
  [true, /^(function|structure|use|if|else|while)/g, TokenKind.keyword],
  [true, /^[_A-Za-z]+[\-_0-9A-Za-z]*/g, TokenKind.ident],
  [true, /^->/g, TokenKind.single_line_arrow],
  [true, /^"/g, TokenKind.stringDelimiter, stringLiteral],
  [true, /^{/g, TokenKind.standalonePunctuation, "push"],
  // A closing brace is unspecified, because the lexer cannot recognize whether it
  // is a standalone punctuation or a terminating string interpolation delimiter.
  [true, /^}/g, TokenKind.unspecified, "pop"],
  [true, /^[()<>$"]/g, TokenKind.standalonePunctuation],
  [true, /^[!@=#%^&*_+\[\]:;\|,.?~\\/\-]+/g, TokenKind.punctuation],
  [true, /^\S/g, TokenKind.unspecified],
);

stringLiteral.push(
  [true, /^"/g, TokenKind.stringDelimiter, "pop"],
  [true, /^\${/g, TokenKind.stringInterpolationDelimiter, statements],
  [true, /^\\"/g, TokenKind.stringContents],
  [true, /^\$/g, TokenKind.stringContents],
  [true, /^\\\${/g, TokenKind.stringContents],
  [true, /^[^"$\\]+/g, TokenKind.stringContents],
);

const lexer = buildLexer(statements);

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
