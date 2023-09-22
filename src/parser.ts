import { Rule, Parser, apply, rule, seq, tok } from "typescript-parsec";
import { TokenType } from "./lexer.ts";

function newRule<TResult>(initializer: (rule: Rule<TokenType, TResult>) => void) {
  const empty = rule<TokenType, TResult>();
  initializer(empty);
  return empty;
}

function toRule(parser: Parser<TokenType, unknown>) {
  const newRule = rule();
  newRule.setPattern(parser);
  return newRule;
}

const OPTIONAL_WHITESPACE = toRule(
  tok(TokenType.whitespace)
);

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
