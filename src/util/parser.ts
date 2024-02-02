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
