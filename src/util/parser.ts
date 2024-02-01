import { apply, Parser, rep_sc, seq } from "typescript-parsec";

/**
 * Like rep_sc(p) from `typescript-parsec`, but consumes p at least once.
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
 * Like lrec_sc(a, b, f) from `typescript-parsec`, but b consists of an operator and an operand (same type as a).
 * Also, b has to occur at least once.
 */
export function operation_chain_sc<TKind, Operand, Operator, Result>(
  operand: Parser<TKind, Operand>,
  operator: Parser<TKind, Operator>,
  callback: (
    first: Operand,
    operator: Operator,
    second: Operand | Result,
  ) => Result,
): Parser<TKind, Result> {
  return apply(
    seq(
      operand,
      rep_at_least_once_sc(
        seq(
          operator,
          operand,
        ),
      ),
    ),
    ([initial, operations]) => {
      function buildTree(
        remainder: typeof operations,
      ): [Operator, Operand | Result] {
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
