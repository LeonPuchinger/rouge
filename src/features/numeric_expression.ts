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
import { NumericSymbolValue, SymbolFlags, SymbolValue } from "../symbol.ts";
import { CompositeSymbolType, SymbolType } from "../type.ts";
import { InternalError, RuntimeError } from "../util/error.ts";
import { memoize } from "../util/memoize.ts";
import { None, Some, Wrapper } from "../util/monad/index.ts";
import { operation_chain_sc } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { configureExpression } from "./expression.ts";
import { numericExpression } from "./parser_declarations.ts";

/* AST NODES */

/* Numeric literal */

class NumericLiteralAstNode implements NumericExpressionAstNode {
  token!: Token<TokenKind>;

  constructor(params: Attributes<NumericLiteralAstNode>) {
    Object.assign(this, params);
  }

  analyze(_environment: ExecutionEnvironment): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  @memoize
  evaluate(_environment: ExecutionEnvironment): SymbolValue<number> {
    return new NumericSymbolValue(parseFloat(this.token.text));
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Number" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.token];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Unary Expression */

class UnaryNumericExpressionAstNode implements NumericExpressionAstNode {
  child!: NumericExpressionAstNode;
  operatorToken!: Token<TokenKind>;

  constructor(params: Attributes<UnaryNumericExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<number> {
    if (!["+", "-"].includes(this.operatorToken.text)) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on a number: ${this.operatorToken.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    return this.child.evaluate(environment)
      .map((result) => {
        if (this.operatorToken.text === "-") {
          return -result;
        }
        return result;
      });
  }

  resolveType(): SymbolType {
    return new CompositeSymbolType({ id: "Number" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.operatorToken, this.child.tokenRange()[1]];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Binary expression */

class BinaryNumericExpressionAstNode implements NumericExpressionAstNode {
  lhs!: NumericExpressionAstNode;
  rhs!: NumericExpressionAstNode;
  operatorToken!: Token<TokenKind>;

  constructor(params: Attributes<BinaryNumericExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    if (this.rhs instanceof NumericLiteralAstNode) {
      const divisorValue = (this.rhs as NumericLiteralAstNode).evaluate(
        environment,
      );
      if (divisorValue.value === 0) {
        findings.errors.push(AnalysisError(environment, {
          message: "Cannot divide by zero.",
          beginHighlight: this.rhs,
          endHighlight: Some(this.rhs),
          messageHighlight:
            "Check whether this side of the expression is zero before performing the calculation.",
        }));
      }
    }
    findings = AnalysisFindings.merge(
      findings,
      this.lhs.analyze(environment),
    );
    findings = AnalysisFindings.merge(
      findings,
      this.rhs.analyze(environment),
    );
    return findings;
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<number> {
    if (!["+", "-", "*", "/", "%"].includes(this.operatorToken.text)) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on two numbers: ${this.operatorToken.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    return new Wrapper([
      this.lhs.evaluate(environment),
      this.rhs.evaluate(environment),
    ])
      .map(([left, right]) => {
        switch (this.operatorToken.text) {
          case "+":
            return left.value + right.value;
          case "-":
            return left.value - right.value;
          case "*":
            return left.value * right.value;
          case "/":
            if (right.value === 0) {
              throw new RuntimeError(environment, {
                message: "Division by zero is not possible.",
                include: [this.lhs, this.rhs],
                highlight: [this.rhs],
                highlightMessage:
                  "Check whether this side of the expression is zero before performing the calculation.",
              });
            }
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

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Number" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.lhs.tokenRange()[0], this.rhs.tokenRange()[1]];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Ambiguously typed expression */

class AmbiguouslyTypedExpressionAstNode implements NumericExpressionAstNode {
  child!: EvaluableAstNode<SymbolValue<unknown>>;

  constructor(params: Attributes<AmbiguouslyTypedExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const analysisFindings = this.child.analyze(environment);
    if (analysisFindings.isErroneous()) {
      return analysisFindings;
    }
    if (!this.child.resolveType(environment).isFundamental("Number")) {
      analysisFindings.errors.push(AnalysisError(environment, {
        message:
          "You tried to use a numeric operation on something that is not a number.",
        beginHighlight: this,
        endHighlight: None(),
        messageHighlight: `This expression does not evaluate to a number.`,
      }));
    }
    return analysisFindings;
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<number> {
    // Type safety has been assured by static analysis
    return this.child.evaluate(environment) as SymbolValue<number>;
  }

  resolveType(_environment: ExecutionEnvironment): SymbolType {
    return new CompositeSymbolType({ id: "Number" });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return this.child.tokenRange();
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* Numeric expression */

export type NumericExpressionAstNode = EvaluableAstNode<SymbolValue<number>>;

/* PARSER */

const literal = apply(
  tok(TokenKind.numericLiteral),
  (literal): NumericLiteralAstNode =>
    new NumericLiteralAstNode({ token: literal }),
);

const unaryOperation = apply(
  seq<TokenKind, Token<TokenKind>, NumericExpressionAstNode>(
    alt_sc(str("+"), str("-")),
    numericExpression,
  ),
  (components): UnaryNumericExpressionAstNode =>
    new UnaryNumericExpressionAstNode({
      operatorToken: components[0],
      child: components[1],
    }),
);

const parenthesized: Parser<TokenKind, NumericExpressionAstNode> = kmid(
  str("("),
  numericExpression,
  str(")"),
);

const ambiguouslyTypedExpression = apply(
  configureExpression({
    includeNumericExpression: false,
  }),
  (node) =>
    new AmbiguouslyTypedExpressionAstNode({
      child: node,
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
      new BinaryNumericExpressionAstNode({
        lhs: first,
        rhs: second,
        operatorToken: op,
      }),
    params.allow_unary ? 0 : 1,
  );

const sum = operation_chain_sc(
  product({ allow_unary: true }),
  alt_sc(str("+"), str("-")),
  (first, op, second: NumericExpressionAstNode) =>
    new BinaryNumericExpressionAstNode({
      lhs: first,
      rhs: second,
      operatorToken: op,
    }),
);

numericExpression.setPattern(alt_sc(
  sum,
  product({ allow_unary: false }),
  simpleNumericExpression,
));
