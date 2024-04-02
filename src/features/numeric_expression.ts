import {
  alt_sc,
  apply,
  kmid,
  Parser,
  rule,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import * as ast from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  NumericSymbolValue,
  PrimitiveSymbolType,
  SymbolValue,
} from "../symbol.ts";
import { InternalError } from "../util/error.ts";
import { Wrapper } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import { operation_chain_sc } from "../util/parser.ts";
import { symbolExpression } from "./expression.ts";

/* AST NODES */

/* Numeric literal */

type NumericLiteralAstNode =
  & ast.ValueAstNode<number>
  & NumericExpressionAstNode;

function createNumericLiteralAstNode(params: {
  value: number;
  token: Token<TokenKind>;
}): NumericLiteralAstNode {
  return {
    ...params,
    evaluate() {
      return evaluateNumericLiteral(this);
    },
    analyze() {
      return analyzeNumericLiteral();
    },
    resolveType() {
      return new PrimitiveSymbolType("number");
    },
  };
}

function analyzeNumericLiteral(): AnalysisFindings {
  return AnalysisFindings.empty();
}

function evaluateNumericLiteral(
  node: NumericLiteralAstNode,
): SymbolValue<number> {
  return new NumericSymbolValue(node.value);
}

/* Unary Expression */

type UnaryNumericExpressionAstNode =
  & ast.WrapperAstNode<NumericExpressionAstNode>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createUnaryNumericExpressionAstNode(params: {
  child: NumericExpressionAstNode;
  token: Token<TokenKind>;
}): UnaryNumericExpressionAstNode {
  return {
    ...params,
    evaluate() {
      return evaluateUnaryExpression(this);
    },
    analyze() {
      return analyzeUnaryExpression();
    },
    resolveType() {
      return new PrimitiveSymbolType("number");
    },
  };
}

function analyzeUnaryExpression() {
  return AnalysisFindings.empty();
}

function evaluateUnaryExpression(
  node: UnaryNumericExpressionAstNode,
): SymbolValue<number> {
  if (!["+", "-"].includes(node.token.text)) {
    throw new InternalError(
      `The interpreter recieved instructions to perform the following unknown operation on a number: ${node.token.text}`,
      "This should have either been caught during static analysis or be prevented by the parser.",
    );
  }
  node.child;
  return node.child.evaluate()
    .map((result) => {
      if (node.token.text === "-") {
        return -result;
      }
      return result;
    });
}

/* Binary expression */

type BinaryNumericExpressionAstNode =
  & ast.BinaryAstNode<NumericExpressionAstNode, NumericExpressionAstNode>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createBinaryNumericExpressionAstNode(params: {
  lhs: NumericExpressionAstNode;
  rhs: NumericExpressionAstNode;
  token: Token<TokenKind>;
}): BinaryNumericExpressionAstNode {
  return {
    ...params,
    evaluate() {
      return evaluateBinaryExpression(this);
    },
    analyze() {
      return analyzeBinaryExpression();
    },
    resolveType() {
      return new PrimitiveSymbolType("number");
    },
  };
}

function analyzeBinaryExpression() {
  return AnalysisFindings.empty();
}

function evaluateBinaryExpression(
  node: BinaryNumericExpressionAstNode,
): SymbolValue<number> {
  if (!["+", "-", "*", "/", "%"].includes(node.token.text)) {
    throw new InternalError(
      `The interpreter recieved instructions to perform the following unknown operation on two numbers: ${node.token.text}`,
      "This should have either been caught during static analysis or be prevented by the parser.",
    );
  }
  return new Wrapper([node.lhs.evaluate(), node.rhs.evaluate()])
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
    .map((result) => new NumericSymbolValue(result))
    .unwrap();
}

/* Ambiguously typed expression */

type AmbiguouslyTypedExpressionAstNode =
  & ast.WrapperAstNode<ast.EvaluableAstNode<SymbolValue<unknown>>>
  & ast.TokenAstNode
  & NumericExpressionAstNode;

function createAmbiguouslyTypedExpressionAstNode(params: {
  child: ast.EvaluableAstNode<SymbolValue<unknown>>;
  token: Token<TokenKind>;
}): AmbiguouslyTypedExpressionAstNode {
  return {
    ...params,
    evaluate() {
      return evaluateAmbiguouslyTypedExpression(this);
    },
    analyze() {
      return analyzeAmbiguouslyTypedExpression(this);
    },
    resolveType() {
      return new PrimitiveSymbolType("number");
    },
  };
}

function analyzeAmbiguouslyTypedExpression(
  node: AmbiguouslyTypedExpressionAstNode,
): AnalysisFindings {
  const analysisResult = node.child.analyze();
  if (!node.child.resolveType().isPrimitive("number")) {
    analysisResult.errors.push(AnalysisError({
      message:
        "You tried to use a numeric operation on something that is not a number.",
      beginHighlight: node,
      endHighlight: None(),
      messageHighlight: `"${node.token.text}" can not be used as a number.`,
    }));
  }
  return analysisResult;
}

function evaluateAmbiguouslyTypedExpression(
  node: AmbiguouslyTypedExpressionAstNode,
): SymbolValue<number> {
  // Type safety has been assured by static analysis
  return node.child.evaluate() as SymbolValue<number>;
}

/* Numeric expression */

type NumericExpressionAstNode = ast.EvaluableAstNode<SymbolValue<number>>;

/* PARSER */

// Forward declaration of exported top-level rule
export const numericExpression = rule<TokenKind, NumericExpressionAstNode>();

const literal = apply(
  tok(TokenKind.numeric_literal),
  (literal): NumericLiteralAstNode =>
    createNumericLiteralAstNode({
      token: literal,
      value: parseFloat(literal.text),
    }),
);

const unaryOperation = apply(
  seq<TokenKind, Token<TokenKind>, NumericExpressionAstNode>(
    alt_sc(str("+"), str("-")),
    numericExpression,
  ),
  (components): UnaryNumericExpressionAstNode =>
    createUnaryNumericExpressionAstNode({
      token: components[0],
      child: components[1],
    }),
);

const parenthesized: Parser<TokenKind, NumericExpressionAstNode> = kmid(
  str("("),
  numericExpression,
  str(")"),
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

const simpleNumericExpression = alt_sc(
  unaryOperation,
  parenthesized,
  literal,
);

const factor: Parser<TokenKind, NumericExpressionAstNode> = alt_sc(
  simpleNumericExpression,
  ambiguouslyTypedExpression,
);

const product = (params: { allow_unary: boolean } = { allow_unary: false }) =>
  operation_chain_sc(
    factor,
    alt_sc(str("*"), str("/")),
    (first, op, second: NumericExpressionAstNode) =>
      createBinaryNumericExpressionAstNode({
        lhs: first,
        rhs: second,
        token: op,
      }),
    params.allow_unary ? 0 : 1,
  );

const sum = operation_chain_sc(
  product({ allow_unary: true }),
  alt_sc(str("+"), str("-")),
  (first, op, second: NumericExpressionAstNode) =>
    createBinaryNumericExpressionAstNode({
      lhs: first,
      rhs: second,
      token: op,
    }),
);

numericExpression.setPattern(alt_sc(
  sum,
  product({ allow_unary: false }),
  simpleNumericExpression,
));
