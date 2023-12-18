import {
  alt_sc,
  apply,
  kmid,
  Parser,
  rule,
  seq,
  str,
  tok,
} from "typescript-parsec";
import * as analysis from "../analysis.ts";
import * as ast from "../ast.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, Result, Some } from "../util/monad/index.ts";

type EvaluatesToNumber = ast.EvaluableAstNode<SymbolValue<number>>;

export type BinaryNumericExpressionAstNode =
  & ast.BinaryAstNode<EvaluatesToNumber, EvaluatesToNumber>
  & ast.TokenAstNode
  & EvaluatesToNumber;

export const numericExpression = rule<TokenType, EvaluatesToNumber>();

function evaluateBinaryOperation(
  node: BinaryNumericExpressionAstNode,
): Result<SymbolValue<number>, AppError> {
  if (!["+", "-", "*", "/", "%"].includes(node.token.text)) {
    return Err(InternalError(
      `The interpreter recieved instructions to perform the following unknown operation on two numbers: ${node.token.text}`,
      "This should have either been caught during static analysis or be prevented by the parser.",
    ));
  }
  return node.lhs.evaluate()
    .combine(node.rhs.evaluate())
    .map(([left, right]) => {
      switch (node.token.text) {
        case "+":
          return left.value + right.value;
        case "-":
          return left.value - right.value;
        case "*":
          return left.value * right.value;
        case "/":
          return left.value / right.value;
        case "%":
          return left.value % right.value;
        default:
          // this never happens, TS simply does not get that the symbol of operations has been checked previously.
          return 0;
      }
    })
    .map((result) =>
      new SymbolValue({ value: result, valueKind: SymbolValueKind.number })
    );
}

function analyzeBinaryOperation() {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

const binaryOperation = apply(
  seq(
    numericExpression,
    alt_sc(str("+"), str("-"), str("*"), str("/"), str("%")),
    numericExpression,
  ),
  (components): BinaryNumericExpressionAstNode => ({
    lhs: components[0],
    rhs: components[2],
    token: components[1],
    evaluate() {
      return evaluateBinaryOperation(this);
    },
    analyze() {
      return analyzeBinaryOperation();
    },
  }),
);

const parenthesized: Parser<TokenType, EvaluatesToNumber> = kmid(
  str("("),
  numericExpression,
  str(")"),
);

const literal = apply(
  tok(TokenType.numeric_literal),
  (literal): ast.NumberAstNode => ({
    token: literal,
    value: parseFloat(literal.text),
    evaluate() {
      return interpreter.evaluateNumericLiteral(this);
    },
    analyze() {
      return analysis.analyzeNumericLiteral(this);
    },
  }),
);

numericExpression.setPattern(
  alt_sc(
    binaryOperation,
    parenthesized,
    literal,
  ),
);
