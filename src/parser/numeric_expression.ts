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
import { AnalysisResult } from "../analysis.ts";
import * as ast from "../ast.ts";
import { AnalysisError } from "../finding.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, Ok, Result, Some } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import { ambiguouslyTypedExpression } from "./expression.ts";

// Forward declaration of exported top-level rule
export const numericExpression = rule<TokenType, EvaluatesToNumber>();

// Utility types
type EvaluatesToNumber = ast.EvaluableAstNode<SymbolValue<number>>;
type EvaluatesToSomething = ast.EvaluableAstNode<SymbolValue<unknown>>;

/* Binary operation */

type BinaryNumericExpressionAstNode =
  & ast.BinaryAstNode<EvaluatesToNumber, EvaluatesToNumber>
  & ast.TokenAstNode
  & EvaluatesToNumber;

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

/* Parenthesised expression */

const parenthesized: Parser<TokenType, EvaluatesToNumber> = kmid(
  str("("),
  numericExpression,
  str(")"),
);

/* Numeric literal */

type NumericLiteralAstNode =
  & ast.ValueAstNode<number>
  & EvaluatesToNumber;

function evaluateNumericLiteral(
  node: NumericLiteralAstNode,
): Result<SymbolValue<number>, AppError> {
  return Ok(
    new SymbolValue({
      valueKind: SymbolValueKind.number,
      value: node.value,
    }),
  );
}

function analyzeNumericLiteral(): AnalysisResult<SymbolValueKind> {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

const literal = apply(
  tok(TokenType.numeric_literal),
  (literal): NumericLiteralAstNode => ({
    token: literal,
    value: parseFloat(literal.text),
    evaluate() {
      return evaluateNumericLiteral(this);
    },
    analyze() {
      return analyzeNumericLiteral();
    },
  }),
);

/* Numeric expression */

type NumericExpressionAstNode =
  & ast.WrapperAstNode<EvaluatesToSomething>
  & EvaluatesToNumber;

function evaluateNumericExpression(
  node: NumericExpressionAstNode,
): Result<SymbolValue<number>, AppError> {
  return node.evaluate();
}

function analyzeNumericExpression(
  node: NumericExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const analysisResult = node.child.analyze();
  if (
    analysisResult.value.kind === "some" &&
    analysisResult.value.unwrap() !== SymbolValueKind.number
  ) {
    return {
      ...analysisResult,
      value: None(),
      errors: [AnalysisError({
        message: "You tried to use a numeric operation on something that is not a number.",
        beginHighlight: /* TODO: locate AST node responsible for error */,
        endHighlight: None(),
      })],
    };
  }
  return analysisResult;
}

numericExpression.setPattern(
  apply(
    alt_sc(
      binaryOperation,
      parenthesized,
      literal,
      ambiguouslyTypedExpression,
    ),
    (node): NumericExpressionAstNode => ({
      child: node,
      analyze() {
        return analyzeNumericExpression(this);
      },
      evaluate() {
        return evaluateNumericExpression(this);
      },
    }),
  ),
);
