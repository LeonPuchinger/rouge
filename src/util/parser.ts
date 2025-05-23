import {
  alt_sc,
  apply,
  kleft,
  kmid,
  kright,
  opt_sc,
  Parser,
  rep_sc,
  seq,
  tok,
} from "typescript-parsec";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "./error.ts";

/**
 * Like `rep_sc(p)` from `typescript-parsec`, but consumes p at least once.
 */
export function rep_at_least_once_sc<TKind, Result>(
  p: Parser<TKind, Result>,
): Parser<TKind, Result[]> {
  return apply(
    seq(
      p,
      rep_sc(p),
    ),
    ([first, remainder]) => [first, ...remainder],
  );
}

/**
 * Like `kmid(a, b, c)` from `typescript-parsec`, but returns Ta and Tc instead of Tb.
 */
export function kouter<TKind, Left, Right>(
  left: Parser<TKind, Left>,
  ignore: Parser<TKind, unknown>,
  right: Parser<TKind, Right>,
): Parser<TKind, [Left, Right]> {
  return apply(
    seq(
      left,
      ignore,
      right,
    ),
    (results) => [results[0], results[2]],
  );
}

/**
 * Like `lrec_sc(a, b, f)` from `typescript-parsec`, but b consists of an operator and an operand (the latter has the same type as a).
 * Also, it can be specified whether at least one operation needs to be there for the parser to succeed.
 * @param operand equivalent to `lrec_sc`'s `a` and `b1` if `b = seq(b0, b1)`.
 * @param operator equivalent to `lrec_sc`'s `b0` if `b = seq(b0, b1)`.
 * @param callback equvalent to `lrec_sc`'s `f`.
 * @param minimum_operations whether at least one operation (equivalent to `lrec`'s `b`) should be matched by the parser.
 */
export function operation_chain_sc<
  TKind,
  Operand extends Result,
  Operator,
  Result,
>(
  operand: Parser<TKind, Operand>,
  operator: Parser<TKind, Operator>,
  callback: (
    first: Operand,
    operator: Operator,
    second: Result,
  ) => Result,
  minimum_operations: 0 | 1 = 1,
): Parser<TKind, Result> {
  return apply(
    seq(
      operand,
      (minimum_operations === 0)
        ? rep_sc(seq(
          operator,
          operand,
        ))
        : rep_at_least_once_sc(seq(
          operator,
          operand,
        )),
    ),
    ([initial, operations]) => {
      function buildTree(
        remainder: typeof operations,
      ): [Operator, Result] {
        if (remainder.length === 1) {
          return remainder[0];
        }
        const [currentOperator, currentExpression] = remainder[0];
        const [nextOperator, nextExpression] = buildTree(remainder.slice(1));
        return [
          currentOperator,
          callback(
            currentExpression,
            nextOperator,
            nextExpression,
          ),
        ];
      }
      if (operations.length === 0) {
        return initial;
      }
      // start recursion
      const [operator, right] = buildTree(operations);
      return callback(
        initial,
        operator,
        right,
      );
    },
  );
}

/**
 * Prefixes a parser with another parsers which optionally parses breaking whitespace.
 */
export function starts_with_breaking_whitespace<T>(
  p: Parser<TokenKind, T>,
): Parser<TokenKind, T> {
  return kright(
    opt_sc(tok(TokenKind.breakingWhitespace)),
    p,
  );
}

/**
 * Appends a parser with another parsers which optionally parses breaking whitespace.
 */
export function ends_with_breaking_whitespace<T>(
  p: Parser<TokenKind, T>,
): Parser<TokenKind, T> {
  return kleft(
    p,
    opt_sc(tok(TokenKind.breakingWhitespace)),
  );
}

/**
 * Surrounds a parser with two other parsers which can both optionally parse breaking whitespace.
 */
export function surround_with_breaking_whitespace<T>(
  p: Parser<TokenKind, T>,
): Parser<TokenKind, T> {
  return kmid(
    opt_sc(tok(TokenKind.breakingWhitespace)),
    p,
    opt_sc(tok(TokenKind.breakingWhitespace)),
  );
}

/**
 * Like `opt_sc(p)` from `typescript-parsec` but allows specifying a default value in case p fails.
 */
export function opt_sc_default<T>(
  p: Parser<TokenKind, T>,
  defaultValue: T,
): Parser<TokenKind, T> {
  return apply(
    opt_sc(p),
    (result) => result ?? defaultValue,
  );
}

/**
 * Works like `alt_sc` from `typescript-parsec`, but accepts a variable number of parsers.
 */
export function alt_sc_var<T>(
  ...parsers: Parser<TokenKind, T>[]
): Parser<TokenKind, T> {
  if (parsers.length < 2) {
    throw new InternalError("alt_sc_var requires at least two parsers.");
  }
  // alt_sc can accept a fixed amount of two parsers, so we use it
  // to apply the variable amount of parsers in pairs to form a hierachical
  // "chain" of parsers.
  return parsers
    .slice(0, -2)
    .toReversed()
    .reduce(
      (acc, parser) => alt_sc(parser, acc),
      alt_sc(parsers.at(-2)!, parsers.at(-1)!),
    );
}
