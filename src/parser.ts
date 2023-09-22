import { Rule, apply, rule, seq, tok } from "typescript-parsec";
import { TokenType } from "./lexer.ts";

function newRule<TResult>(initializer: (rule: Rule<TokenType, TResult>) => void) {
  const empty = rule<TokenType, TResult>();
  initializer(empty);
  return empty;
}

const OPTIONAL_WHITESPACE = newRule((rule) => rule.setPattern(
  tok(TokenType.whitespace)
));

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
