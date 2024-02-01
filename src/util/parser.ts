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
      ): [Operator, Result] {
        if (remainder.length === 2) {
          // The recursion ends at 2 so we can always return a `Result`.
          // If the recursion were to end at 1, the last step would return a `Operand`
          // which would break type safety (see return type of this function).
          const [first, second] = remainder;
          const [firstOperator, firstExpression] = first;
          const [secondOperator, secondExpression] = second;
          return [
            firstOperator,
            callback(
              firstExpression,
              secondOperator,
              secondExpression,
            ),
          ];
        }
        const current = remainder[0];
        const [currentOperator, currentExpression] = current;
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
      // if the expression only consists of a single operation, don't initiate the recursion.
      if (operations.length === 1) {
        const [operator, expression] = operations[0];
        return callback(
          initial,
          operator,
          expression,
        );
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
