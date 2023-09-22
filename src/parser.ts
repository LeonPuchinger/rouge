import { apply, rule, seq, tok } from "typescript-parsec";
import { TokenType } from "./lexer.ts";

const EXPR = rule<TokenType, number>();
EXPR.setPattern(
  apply(
    seq(
      tok(TokenType.ident),
      tok(TokenType.eq_operator),
      tok(TokenType.int_literal),
    ),
    (value) => +value[2], // dummy value: this should evaluate to an AST node
  ),
);
