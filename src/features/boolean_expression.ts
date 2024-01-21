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
import { AnalysisError, AnalysisFinding } from "../finding.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, None, Ok, Result, Some } from "../util/monad/index.ts";
import { peelToLeftmostTokenNode } from "../util/snippet.ts";
import { booleanlessExpression } from "./declarations.ts";

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
  & ast.BinaryAstNode<ast.EvaluableAstNode<SymbolValue<unknown>>, ast.EvaluableAstNode<SymbolValue<unknown>>>
  & ast.TokenAstNode
  & BooleanExpressionAstNode;

function createBinaryBooleanExpressionAstNode(params: {
  lhs: ast.EvaluableAstNode<SymbolValue<unknown>>;
  rhs: ast.EvaluableAstNode<SymbolValue<unknown>>;
  token: Token<TokenType>;
}): BinaryBooleanExpressionAstNode {
  return {
    ...params,
    analyze() {
      return analyzeBinaryExpression(this);
    },
    evaluate() {
      return evaluateBinaryExpression(this);
    },
  };
}

function analyzeBinaryExpression(
  node: BinaryBooleanExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const errors: AnalysisFinding[] = [];
  const operator = node.token.text;
  node.lhs.analyze().value
    .zip(node.rhs.analyze().value)
    .then(([leftType, rightType]) => {
      if (
        ["==", "!="].includes(operator) &&
        leftType !== rightType
      ) {
        errors.push(AnalysisError({
          message:
            "You tried to compare two values that don't have the same type. That is not possible.",
          beginHighlight: node,
          endHighlight: None(),
        }));
      }
      if (
        [">", ">=", "<", "<="].includes(operator) &&
        (leftType !== SymbolValueKind.number ||
          rightType !== SymbolValueKind.number)
      ) {
        errors.push(AnalysisError({
          message:
            'The "greater/smaller than" operator can only be used on numbers.',
          beginHighlight: node,
          endHighlight: None(),
        }));
      }
      if (
        ["&&", "||", "^"].includes(operator) &&
        (leftType !== SymbolValueKind.boolean ||
          rightType !== SymbolValueKind.boolean)
      ) {
        errors.push(AnalysisError({
          message:
            "You tried to use a boolean combination operators on something that is not a boolean.",
          beginHighlight: node,
          endHighlight: None(),
        }));
      }
      if (leftType !== rightType) {
        errors.push();
      }
    });
  return {
    value: Some(SymbolValueKind.boolean),
    warnings: [],
    errors: errors,
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
      if (left.valueKind === right.valueKind) {
        
      }
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
      new SymbolValue({ value: result, valueKind: SymbolValueKind.boolean })
    );
}

/* Type asserted expression */

type TypeAssertedExpressionAstNode =
  & ast.WrapperAstNode<ast.ExpressionAstNode>
  & BooleanExpressionAstNode;

function createTypeAssertedExpression(params: {
  child: ast.ExpressionAstNode;
}): TypeAssertedExpressionAstNode {
  return {
    child: params.child,
    analyze() {
      return analyzeTypeAssertedExpression(this);
    },
    evaluate() {
      return evaluateTypeAssertedExpression(this);
    },
  };
}

function analyzeTypeAssertedExpression(
  node: TypeAssertedExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const analysisResult = node.child.analyze();
  if (
    analysisResult.value.kind === "some" &&
    analysisResult.value.unwrap() !== SymbolValueKind.boolean
  ) {
    return {
      ...analysisResult,
      value: None(),
      errors: [AnalysisError({
        message:
          "You tried to use a boolean operation on something that is not a boolean.",
        beginHighlight: peelToLeftmostTokenNode(node),
        endHighlight: None(),
        messageHighlight: `This expression can not be used as a boolean.`,
      })],
    };
  }
  return analysisResult;
}

function evaluateTypeAssertedExpression(
  node: TypeAssertedExpressionAstNode,
): Result<SymbolValue<boolean>, AppError> {
  // Type safety has been assured by static analysis
  return node.child.evaluate() as Result<SymbolValue<boolean>, AppError>;
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

const booleanOperand: Parser<TokenType, ast.EvaluableAstNode<SymbolValue<unknown>>> = alt_sc(
  negation,
  parenthesized,
  literal,
  booleanlessExpression,
);

const typeAssertedExpression = apply(
  booleanlessExpression,
  (child) =>
    createTypeAssertedExpression({
      child: child,
    }),
);

const typeAssertedBooleanOperand = alt_sc(
  booleanOperand,
  typeAssertedExpression,
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
      a: ast.EvaluableAstNode<SymbolValue<unknown>>,
      b: [Token<TokenType>, ast.EvaluableAstNode<SymbolValue<unknown>>],
    ): BooleanExpressionAstNode =>
      createBinaryBooleanExpressionAstNode({
        lhs: a,
        token: b[0],
        rhs: b[1],
      }),
  ),
  booleanOperand,
);

booleanExpression.setPattern(alt_sc(
  binaryBooleanExpression,
  typeAssertedBooleanOperand,
));
