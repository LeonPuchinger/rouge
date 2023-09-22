import { apply, rep, rule, seq, tok } from "typescript-parsec";
import { TokenType } from "./lexer.ts";

const OPTIONAL_WHITESPACE = rep(tok(TokenType.whitespace));

const EXPR = rule<TokenType, number>();
EXPR.setPattern(
  apply(
    seq(
      tok(TokenType.ident),
      OPTIONAL_WHITESPACE,
      tok(TokenType.eq_operator),
      OPTIONAL_WHITESPACE,
      tok(TokenType.int_literal),
    ),
    (value) => +value[2], // dummy value: this should evaluate to an AST node
  ),
);
