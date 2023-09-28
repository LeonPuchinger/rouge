import { buildLexer } from "typescript-parsec";

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
