import {
  alt_sc,
  apply,
  kmid,
  kright,
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
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, Ok, Result, Some } from "../util/monad/index.ts";

/* AST NODES */

/* Boolean literal */

type BooleanLiteralAstNode =
  & ast.ValueAstNode<boolean>
  & BooleanExpressionAstNode;

function createBooleanLiteralAstNode(params: {
  value: boolean;
  token: Token<TokenType>;
}): BooleanLiteralAstNode {
  return {
    ...params,
    analyze() {
      return analyzeBooleanLiteralAstNode();
    },
    evaluate() {
      return evaluateBooleanLiteralAstNode(this);
    },
  };
}

function analyzeBooleanLiteralAstNode(): AnalysisResult<SymbolValueKind> {
  return {
    warnings: [],
    errors: [],
    value: Some(SymbolValueKind.boolean),
  };
}

function evaluateBooleanLiteralAstNode(
  node: BooleanLiteralAstNode,
): Result<SymbolValue<boolean>, AppError> {
  return Ok(
    new SymbolValue({
      valueKind: SymbolValueKind.boolean,
      value: node.value,
    }),
  );
}

/* Negation */

type BooleanNegationAstNode =
  & ast.WrapperAstNode<BooleanExpressionAstNode>
  & BooleanExpressionAstNode;

function createBooleanNegationAstNode(params: {
  child: BooleanExpressionAstNode;
}): BooleanNegationAstNode {
  return {
    ...params,
    analyze() {
      return analyzeBooleanNegationAstNode();
    },
    evaluate() {
      return evaluateBooleanNegationAstNode(this);
    },
  };
}

function analyzeBooleanNegationAstNode(): AnalysisResult<SymbolValueKind> {
  return {
    warnings: [],
    errors: [],
    value: Some(SymbolValueKind.boolean),
  };
}

function evaluateBooleanNegationAstNode(
  node: BooleanNegationAstNode,
): Result<SymbolValue<boolean>, AppError> {
  return node.child.evaluate()
    .map((value) =>
      new SymbolValue({
        valueKind: SymbolValueKind.boolean,
        value: !value,
      })
    );
}

/* Binary Boolean Expression */

type BinaryBooleanExpressionAstNode =
  & ast.BinaryAstNode<BooleanExpressionAstNode, BooleanExpressionAstNode>
  & ast.TokenAstNode
  & BooleanExpressionAstNode;

function createBinaryBooleanExpressionAstNode(params: {
  lhs: BooleanExpressionAstNode;
  rhs: BooleanExpressionAstNode;
  token: Token<TokenType>;
}): BinaryBooleanExpressionAstNode {
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
    value: Some(SymbolValueKind.boolean),
    warnings: [],
    errors: [],
  };
}

function evaluateBinaryExpression(
  node: BinaryBooleanExpressionAstNode,
): Result<SymbolValue<boolean>, AppError> {
  if (
    !["==", "!=", ">", ">=", "<", "<=", "&&", "||", "^"]
      .includes(node.token.text)
  ) {
    return Err(InternalError(
      `The interpreter recieved instructions to perform the following unknown operation on two booleans: ${node.token.text}`,
      "This should have either been caught during static analysis or be prevented by the parser.",
    ));
  }
  return node.lhs.evaluate()
    .combine(node.rhs.evaluate())
    .map(([left, right]) => {
      switch (node.token.text) {
        case "==":
          return left.value == right.value;
        case "!=":
          return left.value != right.value;
        case ">":
          return left.value > right.value;
        case ">=":
          return left.value >= right.value;
        case "<":
          return left.value < right.value;
        case "<=":
          return left.value <= right.value;
        case "&&":
          return left.value && right.value;
        case "||":
          return left.value || right.value;
        case "^":
          return (left.value || right.value) && !(left.value && right.value);
        default:
          // this never happens, TS simply does not get that the symbol of operations has been checked previously.
          return false;
      }
    })
    .map((result) =>
      new SymbolValue({ value: result, valueKind: SymbolValueKind.number })
    );
}

/* Boolean Expression */

type BooleanExpressionAstNode = ast.EvaluableAstNode<SymbolValue<boolean>>;

/* PARSER */

// Forward declaration of exported top-level rule
export const booleanExpression = rule<TokenType, BooleanExpressionAstNode>();

const literal = apply(
  tok(TokenType.boolean_literal),
  (token) =>
    createBooleanLiteralAstNode({
      token: token,
      value: token.text === "true",
    }),
);

const negation: Parser<TokenType, BooleanExpressionAstNode> = apply(
  kright(
    str("!"),
    booleanExpression,
  ),
  (expression) =>
    createBooleanNegationAstNode({
      child: expression,
    }),
);

const parenthesized: Parser<TokenType, BooleanExpressionAstNode> = kmid(
  str("("),
  booleanExpression,
  str(")"),
);

const booleanOperand: Parser<TokenType, BooleanExpressionAstNode> = alt_sc(
  negation,
  parenthesized,
  literal,
);

const binaryBooleanExpression = alt_sc(
  lrec_sc(
    booleanOperand,
    seq(
      alt_sc(
        str("=="),
        str("!="),
        str(">"),
        str(">="),
        str("<"),
        str("<="),
        str("&&"),
        str("||"),
        str("^"),
      ),
      booleanOperand,
    ),
    (
      a: BooleanExpressionAstNode,
      b: [Token<TokenType>, BooleanExpressionAstNode],
    ): BooleanExpressionAstNode =>
      createBinaryBooleanExpressionAstNode({
        lhs: a,
        token: b[0],
        rhs: b[1],
      }),
  ),
  booleanOperand,
);

booleanExpression.setPattern(binaryBooleanExpression);
