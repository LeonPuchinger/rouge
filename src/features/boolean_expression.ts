import {
  alt_sc,
  apply,
  kmid,
  Parser,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { BooleanSymbolValue, SymbolFlags, SymbolValue } from "../symbol.ts";
import { CompositeSymbolType, SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None, Wrapper } from "../util/monad/index.ts";
import { rep_at_least_once_sc } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { configureExpression, ExpressionAstNode } from "./expression.ts";
import { booleanExpression } from "./parser_declarations.ts";

/* AST NODES */

/* Boolean literal */

class BooleanLiteralAstNode implements BooleanExpressionAstNode {
  token!: Token<TokenKind>;

  constructor(params: Attributes<BooleanLiteralAstNode>) {
    Object.assign(this, params);
  }

  analyze(_environment: ExecutionEnvironment): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  @memoize
  evaluate(_environment: ExecutionEnvironment): SymbolValue<boolean> {
    return new BooleanSymbolValue(this.token.text === "true");
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Boolean" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.token];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Negation */

class BooleanNegationAstNode implements BooleanExpressionAstNode {
  negationToken!: Token<TokenKind>;
  child!: BooleanExpressionAstNode;

  constructor(params: Attributes<BooleanNegationAstNode>) {
    Object.assign(this, params);
  }

  analyze(_environment: ExecutionEnvironment): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<boolean> {
    return this.child.evaluate(environment).map((value) => !value);
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Boolean" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.negationToken, this.child.tokenRange()[1]];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Binary Boolean Expression */

class BinaryBooleanExpressionAstNode implements BooleanExpressionAstNode {
  lhs!: EvaluableAstNode<SymbolValue<unknown>>;
  rhs!: EvaluableAstNode<SymbolValue<unknown>>;
  operatorToken!: Token<TokenKind>;

  constructor(params: Attributes<BinaryBooleanExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = AnalysisFindings.merge(
      this.lhs.analyze(environment),
      this.rhs.analyze(environment),
    );
    if (findings.isErroneous()) {
      return findings;
    }
    const operator = this.operatorToken.text;
    const leftType = this.lhs.resolveType(environment);
    const rightType = this.rhs.resolveType(environment);
    if (
      ["==", "!="].includes(operator) &&
      !leftType.typeCompatibleWith(rightType)
    ) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "You tried to compare two values that don't have the same type. That is not possible.",
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    if (
      [">", ">=", "<", "<="].includes(operator) &&
      (!leftType.isFundamental("Number") || !rightType.isFundamental("Number"))
    ) {
      findings.errors.push(AnalysisError(environment, {
        message:
          'The "greater/smaller than" operator can only be used on numbers.',
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    if (
      ["&&", "||", "^"].includes(operator) &&
      (!leftType.isFundamental("Boolean") ||
        !rightType.isFundamental("Boolean"))
    ) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "You tried to use a boolean combination operators on something that is not a boolean.",
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    return findings;
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<boolean> {
    if (
      !["==", "!=", ">=", ">", "<=", "<", "&&", "||", "^"]
        .includes(this.operatorToken.text)
    ) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on two booleans: ${this.operatorToken.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    return new Wrapper([
      this.lhs.evaluate(environment),
      this.rhs.evaluate(environment),
    ])
      .map(([left, right]) => {
        // values can safely be type-casted because their type has been checked during analysis
        switch (this.operatorToken.text) {
          case "==":
            return left.value == right.value;
          case "!=":
            return left.value != right.value;
          case ">=":
            return (left.value as number) >= (right.value as number);
          case ">":
            return (left.value as number) > (right.value as number);
          case "<=":
            return (left.value as number) <= (right.value as number);
          case "<":
            return (left.value as number) < (right.value as number);
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
      .map((result) => new BooleanSymbolValue(result))
      .unwrap();
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Boolean" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.lhs.tokenRange()[0], this.rhs.tokenRange()[1]];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Boolean Expression */

export type BooleanExpressionAstNode = EvaluableAstNode<SymbolValue<boolean>>;

/* PARSER */

const literal = apply(
  tok(TokenKind.booleanLiteral),
  (token) => new BooleanLiteralAstNode({ token: token }),
);

const negation: Parser<TokenKind, BooleanExpressionAstNode> = apply(
  seq(
    str("!"),
    booleanExpression,
  ),
  ([token, expression]) =>
    new BooleanNegationAstNode({
      negationToken: token,
      child: expression,
    }),
);

const parenthesized: Parser<TokenKind, BooleanExpressionAstNode> = kmid(
  str("("),
  booleanExpression,
  str(")"),
);

const booleanlessExpression = apply(
  configureExpression({
    includeBooleanExpression: false,
  }),
  (expression: EvaluableAstNode) =>
    new ExpressionAstNode({
      child: expression,
    }),
);

const unaryBooleanExpression = alt_sc(
  negation,
  parenthesized,
  literal,
);

const booleanOperand: Parser<TokenKind, EvaluableAstNode> = alt_sc(
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
          str(">="),
          str(">"),
          str("<="),
          str("<"),
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
      remainder: [Token<TokenKind>, EvaluableAstNode][],
    ): [Token<TokenKind>, BooleanExpressionAstNode] {
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
          new BinaryBooleanExpressionAstNode({
            lhs: firstExpression,
            rhs: secondExpression,
            operatorToken: secondOperator,
          }),
        ];
      }
      const current = remainder[0];
      const [currentOperator, currentExpression] = current;
      const [nextOperator, nextExpression] = buildTree(remainder.slice(1));
      return [
        currentOperator,
        new BinaryBooleanExpressionAstNode({
          lhs: currentExpression,
          rhs: nextExpression,
          operatorToken: nextOperator,
        }),
      ];
    }
    // if the expression only consists of a single operation, don't initiate a recursion.
    if (operations.length === 1) {
      const [operator, expression] = operations[0];
      return new BinaryBooleanExpressionAstNode({
        lhs: initial,
        rhs: expression,
        operatorToken: operator,
      });
    }
    // start recursion
    const [operator, right] = buildTree(operations);
    return new BinaryBooleanExpressionAstNode({
      lhs: initial,
      rhs: right,
      operatorToken: operator,
    });
  },
);

booleanExpression.setPattern(alt_sc(
  binaryBooleanExpression,
  unaryBooleanExpression,
));
