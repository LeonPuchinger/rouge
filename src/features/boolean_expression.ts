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
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { BooleanSymbolValue, SymbolValue } from "../symbol.ts";
import { PrimitiveSymbolType, SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None, Wrapper } from "../util/monad/index.ts";
import { rep_at_least_once_sc } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { ExpressionAstNode } from "./expression.ts";
import { numericExpression } from "./numeric_expression.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST NODES */

/* Boolean literal */

class BooleanLiteralAstNode implements BooleanExpressionAstNode {
  token!: Token<TokenKind>;

  constructor(params: Attributes<BooleanLiteralAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  @memoize
  evaluate(): SymbolValue<boolean> {
    return new BooleanSymbolValue(this.token.text === "true");
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("boolean");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.token];
  }
}

/* Negation */

class BooleanNegationAstNode implements BooleanExpressionAstNode {
  negationToken!: Token<TokenKind>;
  child!: BooleanExpressionAstNode;

  constructor(params: Attributes<BooleanNegationAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(): SymbolValue<boolean> {
    return this.child.evaluate().map((value) => !value);
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("boolean");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.negationToken, this.child.tokenRange()[1]];
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

  analyze(): AnalysisFindings {
    const findings = AnalysisFindings.merge(
      this.lhs.analyze(),
      this.rhs.analyze(),
    );
    if (findings.isErroneous()) {
      return findings;
    }
    const operator = this.operatorToken.text;
    const leftType = this.lhs.resolveType();
    const rightType = this.rhs.resolveType();
    if (
      ["==", "!="].includes(operator) &&
      !leftType.typeCompatibleWith(rightType)
    ) {
      findings.errors.push(AnalysisError({
        message:
          "You tried to compare two values that don't have the same type. That is not possible.",
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    if (
      [">", ">=", "<", "<="].includes(operator) &&
      (!leftType.isPrimitive("number") || !rightType.isPrimitive("number"))
    ) {
      findings.errors.push(AnalysisError({
        message:
          'The "greater/smaller than" operator can only be used on numbers.',
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    if (
      ["&&", "||", "^"].includes(operator) &&
      (!leftType.isPrimitive("boolean") || !rightType.isPrimitive("boolean"))
    ) {
      findings.errors.push(AnalysisError({
        message:
          "You tried to use a boolean combination operators on something that is not a boolean.",
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    return findings;
  }

  evaluate(): SymbolValue<boolean> {
    if (
      !["==", "!=", ">=", ">", "<=", "<", "&&", "||", "^"]
        .includes(this.operatorToken.text)
    ) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on two booleans: ${this.operatorToken.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    return new Wrapper([this.lhs.evaluate(), this.rhs.evaluate()])
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

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("boolean");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.lhs.tokenRange()[0], this.rhs.tokenRange()[1]];
  }
}

/* Boolean Expression */

type BooleanExpressionAstNode = EvaluableAstNode<SymbolValue<boolean>>;

/* PARSER */

// Forward declaration of exported top-level rule
export const booleanExpression = rule<TokenKind, BooleanExpressionAstNode>();

const literal = apply(
  tok(TokenKind.boolean_literal),
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
  alt_sc(
    numericExpression,
    symbolExpression,
  ),
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
