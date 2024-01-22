import { apply, Parser, rep_sc, seq } from "typescript-parsec";

/**
 * Like rep_sc(p) from `typescript-parsec`, but consumes p at least once.
 */
export function rep_at_least_once_sc<TKind, TResult>(
  p: Parser<TKind, TResult>,
): Parser<TKind, TResult[]> {
  return apply(
    seq(
      p,
      rep_sc(p),
    ),
    ([first, remainder]) => [first, ...remainder],
  );
}
