import {
  alt_sc,
  apply,
  kmid,
  lrec_sc,
  Parser,
  rule,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { AnalysisResult } from "../analysis.ts";
import * as ast from "../ast.ts";
import { AnalysisError } from "../finding.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, Ok, Result, Some } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import { symbolExpression } from "./expression.ts";

// Forward declaration of exported top-level rule
export const numericExpression = rule<TokenType, NumericExpressionAstNode>();

/* AST NODES */

/* Binary expression */

type BinaryNumericExpressionAstNode =
  & ast.BinaryAstNode<NumericExpressionAstNode, NumericExpressionAstNode>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createBinaryNumericExpressionAstNode(params: {
  lhs: NumericExpressionAstNode;
  rhs: NumericExpressionAstNode;
  token: Token<TokenType>;
}): BinaryNumericExpressionAstNode {
  return {
    ...params,
    analyze() {
      return analyzeBinaryExpression();
    },
    evaluate() {
      return evaluateBinaryExpression(this);
    },
  };
}

function analyzeBinaryExpression() {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

function evaluateBinaryExpression(
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

/* Unary Expression */

type UnaryNumericExpressionAstNode =
  & ast.WrapperAstNode<NumericExpressionAstNode>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createUnaryNumericExpressionAstNode(params: {
  child: NumericExpressionAstNode;
  token: Token<TokenType>;
}): UnaryNumericExpressionAstNode {
  return {
    ...params,
    analyze() {
      return analyzeUnaryExpression();
    },
    evaluate() {
      return evaluateUnaryExpression(this);
    },
  };
}

function analyzeUnaryExpression() {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

function evaluateUnaryExpression(
  node: UnaryNumericExpressionAstNode,
): Result<SymbolValue<number>, AppError> {
  if (!["+", "-"].includes(node.token.text)) {
    return Err(InternalError(
      `The interpreter recieved instructions to perform the following unknown operation on a number: ${node.token.text}`,
      "This should have either been caught during static analysis or be prevented by the parser.",
    ));
  }
  return node.child.evaluate()
    .map((result) => {
      if (node.token.text === "-") {
        return -result.value;
      }
      return result.value;
    })
    .map((result) =>
      new SymbolValue({ value: result, valueKind: SymbolValueKind.number })
    );
}

/* Numeric literal */

type NumericLiteralAstNode =
  & ast.ValueAstNode<number>
  & NumericExpressionAstNode;

function createNumericLiteralAstNode(params: {
  value: number;
  token: Token<TokenType>;
}): NumericLiteralAstNode {
  return {
    ...params,
    analyze() {
      return analyzeNumericLiteral();
    },
    evaluate() {
      return evaluateNumericLiteral(this);
    },
  };
}

function analyzeNumericLiteral(): AnalysisResult<SymbolValueKind> {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

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

/* Ambiguously typed expression */

type AmbiguouslyTypedExpressionAstNode =
  & ast.WrapperAstNode<ast.EvaluableAstNode<SymbolValue<unknown>>>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createAmbiguouslyTypedExpressionAstNode(params: {
  child: ast.EvaluableAstNode<SymbolValue<unknown>>;
  token: Token<TokenType>;
}): AmbiguouslyTypedExpressionAstNode {
  return {
    ...params,
    analyze() {
      return analyzeAmbiguouslyTypedExpression(this);
    },
    evaluate() {
      return evaluateAmbiguouslyTypedExpression(this);
    },
  };
}

function analyzeAmbiguouslyTypedExpression(
  node: AmbiguouslyTypedExpressionAstNode,
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
        message:
          "You tried to use a numeric operation on something that is not a number.",
        beginHighlight: node,
        endHighlight: None(),
        messageHighlight: `"${node.token.text}" can not be used as a number.`,
      })],
    };
  }
  return analysisResult;
}

function evaluateAmbiguouslyTypedExpression(
  node: AmbiguouslyTypedExpressionAstNode,
): Result<SymbolValue<number>, AppError> {
  // Type safety has been assured by static analysis
  return node.child.evaluate() as Result<SymbolValue<number>, AppError>;
}

/* Numeric expression */

type NumericExpressionAstNode = ast.EvaluableAstNode<SymbolValue<number>>;

/* PARSER */

const unaryOperation = apply(
  seq<TokenType, Token<TokenType>, NumericExpressionAstNode>(
    alt_sc(str("+"), str("-")),
    numericExpression,
  ),
  (components): UnaryNumericExpressionAstNode =>
    createUnaryNumericExpressionAstNode({
      token: components[0],
      child: components[1],
    }),
);

const parenthesized: Parser<TokenType, NumericExpressionAstNode> = kmid(
  str("("),
  numericExpression,
  str(")"),
);

const literal = apply(
  tok(TokenType.numeric_literal),
  (literal): NumericLiteralAstNode =>
    createNumericLiteralAstNode({
      token: literal,
      value: parseFloat(literal.text),
    }),
);

const ambiguouslyTypedExpression = apply(
  // TODO: add `invocation` as an alternative
  symbolExpression,
  (node): AmbiguouslyTypedExpressionAstNode =>
    createAmbiguouslyTypedExpressionAstNode({
      child: node,
      token: node.token,
    }),
);

const factor: Parser<TokenType, NumericExpressionAstNode> = alt_sc(
  unaryOperation,
  parenthesized,
  ambiguouslyTypedExpression,
  literal,
);

const product = alt_sc(
  lrec_sc(
    factor,
    seq(
      alt_sc(str("*"), str("/")),
      factor,
    ),
    (
      a: NumericExpressionAstNode,
      b: [Token<TokenType>, NumericExpressionAstNode],
    ): NumericExpressionAstNode =>
      createBinaryNumericExpressionAstNode({
        lhs: a,
        token: b[0],
        rhs: b[1],
      }),
  ),
  factor,
);

const sum = alt_sc(
  lrec_sc(
    product,
    seq(
      alt_sc(str("+"), str("-")),
      product,
    ),
    (
      a: NumericExpressionAstNode,
      b: [Token<TokenType>, NumericExpressionAstNode],
    ): NumericExpressionAstNode =>
      createBinaryNumericExpressionAstNode({
        lhs: a,
        token: b[0],
        rhs: b[1],
      }),
  ),
  factor,
);

numericExpression.setPattern(sum);
