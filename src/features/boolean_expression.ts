import {
  alt_sc,
  apply,
  kmid,
  kright,
  Parser,
  rule,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import * as analysis from "../analysis.ts";
import { AnalysisResult } from "../analysis.ts";
import * as ast from "../ast.ts";
import { AnalysisError, AnalysisFinding } from "../finding.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { BooleanSymbolValue, SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { Err, None, Ok, Result, Some } from "../util/monad/index.ts";
import { rep_at_least_once_sc } from "../util/parser.ts";
import { symbolExpression } from "./expression.ts";
import { numericExpression } from "./numeric_expression.ts";

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
    BooleanSymbolValue(node.value),
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
    .map((value) => BooleanSymbolValue(!value));
}

/* Binary Boolean Expression */

type BinaryBooleanExpressionAstNode =
  & ast.BinaryAstNode<ast.EvaluableAstNode, ast.EvaluableAstNode>
  & ast.TokenAstNode
  & BooleanExpressionAstNode;

function createBinaryBooleanExpressionAstNode(params: {
  lhs: ast.EvaluableAstNode;
  rhs: ast.EvaluableAstNode;
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
      // values can safely be type-casted because their type has been checked during analysis
      switch (node.token.text) {
        case "==":
          return left.value == right.value;
        case "!=":
          return left.value != right.value;
        case ">":
          return (left.value as number) > (right.value as number);
        case ">=":
          return (left.value as number) >= (right.value as number);
        case "<":
          return (left.value as number) < (right.value as number);
        case "<=":
          return (left.value as number) <= (right.value as number);
        case "&&":
          return (left.value as boolean) && (right.value as boolean);
        case "||":
          return (left.value as boolean) || (right.value as boolean);
        case "^":
          return ((left.value as boolean) || (right.value as boolean)) &&
            !((left.value as boolean) && (right.value as boolean));
        default:
          // this never happens, TS simply does not get that the symbol of operations has been checked previously.
          return false;
      }
    })
    .map((result) => BooleanSymbolValue(result));
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

const booleanlessExpression = apply(
  alt_sc(
    numericExpression,
    symbolExpression,
  ),
  (expression): ast.ExpressionAstNode => ({
    ...expression,
    interpret() {
      return interpreter.interpretExpression(this);
    },
    check() {
      return analysis.checkExpression(this);
    },
  }),
);

const unaryBooleanExpression = alt_sc(
  negation,
  parenthesized,
  literal,
);

const booleanOperand: Parser<TokenType, ast.EvaluableAstNode> = alt_sc(
  unaryBooleanExpression,
  booleanlessExpression,
);

const binaryBooleanExpression = apply(
  seq(
    booleanOperand,
    rep_at_least_once_sc(
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
    ),
  ),
  ([initial, operations]) => {
    function buildTree(
      remainder: [Token<TokenType>, ast.EvaluableAstNode][],
    ): [Token<TokenType>, BooleanExpressionAstNode] {
      if (remainder.length === 2) {
        // The recursion ends at 2 so we can always return a boolean expression.
        // If the recursion were to end at 1, the last step could return a generic expression
        // (not boolean) which would break type safety (see return type of this function).
        // This is also the reason why `lrec` cannot be used for this parser.
        const [first, second] = remainder;
        const [firstOperator, firstExpression] = first;
        const [secondOperator, secondExpression] = second;
        return [
          firstOperator,
          createBinaryBooleanExpressionAstNode({
            lhs: firstExpression,
            rhs: secondExpression,
            token: secondOperator,
          }),
        ];
      }
      const current = remainder[0];
      const [currentOperator, currentExpression] = current;
      const [nextOperator, nextExpression] = buildTree(remainder.slice(1));
      return [
        currentOperator,
        createBinaryBooleanExpressionAstNode({
          lhs: currentExpression,
          rhs: nextExpression,
          token: nextOperator,
        }),
      ];
    }
    // if the expression only consists of a single operation, don't initiate a recursion.
    if (operations.length === 1) {
      const [operator, expression] = operations[0];
      return createBinaryBooleanExpressionAstNode({
        lhs: initial,
        rhs: expression,
        token: operator,
      });
    }
    // start recursion
    const [operator, right] = buildTree(operations);
    return createBinaryBooleanExpressionAstNode({
      lhs: initial,
      rhs: right,
      token: operator,
    });
  },
);

booleanExpression.setPattern(alt_sc(
  binaryBooleanExpression,
  unaryBooleanExpression,
));
