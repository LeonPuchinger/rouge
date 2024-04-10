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
import {
  BinaryAstNode,
  EvaluableAstNode,
  TokenAstNode,
  ValueAstNode,
  WrapperAstNode,
} from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  NumericSymbolValue,
  PrimitiveSymbolType,
  SymbolType,
  SymbolValue,
} from "../symbol.ts";
import { InternalError } from "../util/error.ts";
import { Wrapper } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import { operation_chain_sc } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST NODES */

/* Numeric literal */

class NumericLiteralAstNode
  implements ValueAstNode<number>, NumericExpressionAstNode {
  value!: number;
  token!: Token<TokenKind>;

  constructor(params: Attributes<NumericLiteralAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(): SymbolValue<number> {
    return new NumericSymbolValue(this.value);
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("number");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.token];
  }
}

/* Unary Expression */

class UnaryNumericExpressionAstNode
  implements
    WrapperAstNode<NumericExpressionAstNode>,
    TokenAstNode,
    NumericExpressionAstNode {
  child!: NumericExpressionAstNode;
  token!: Token<TokenKind>;

  constructor(params: Attributes<UnaryNumericExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(): SymbolValue<number> {
    if (!["+", "-"].includes(this.token.text)) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on a number: ${this.token.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    this.child;
    return this.child.evaluate()
      .map((result) => {
        if (this.token.text === "-") {
          return -result;
        }
        return result;
      });
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("number");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.child.tokenRange()[1]];
  }
}

/* Binary expression */

class BinaryNumericExpressionAstNode
  implements
    BinaryAstNode<NumericExpressionAstNode, NumericExpressionAstNode>,
    TokenAstNode,
    NumericExpressionAstNode {
  lhs!: NumericExpressionAstNode;
  rhs!: NumericExpressionAstNode;
  token!: Token<TokenKind>;

  constructor(params: Attributes<BinaryNumericExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  evaluate(): SymbolValue<number> {
    if (!["+", "-", "*", "/", "%"].includes(this.token.text)) {
      throw new InternalError(
        `The interpreter recieved instructions to perform the following unknown operation on two numbers: ${this.token.text}`,
        "This should have either been caught during static analysis or be prevented by the parser.",
      );
    }
    return new Wrapper([this.lhs.evaluate(), this.rhs.evaluate()])
      .map(([left, right]) => {
        switch (this.token.text) {
          case "+":
            return left.value + right.value;
          case "-":
            return left.value - right.value;
          case "*":
            return left.value * right.value;
          case "/":
            // TODO: check for division by zero
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

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("number");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.lhs.tokenRange()[0], this.rhs.tokenRange()[1]];
  }
}

/* Ambiguously typed expression */

class AmbiguouslyTypedExpressionAstNode
  implements
    WrapperAstNode<EvaluableAstNode<SymbolValue<unknown>>>,
    TokenAstNode,
    NumericExpressionAstNode {
  child!: EvaluableAstNode<SymbolValue<unknown>>;
  token!: Token<TokenKind>;

  constructor(params: Attributes<AmbiguouslyTypedExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    const analysisResult = this.child.analyze();
    if (!this.child.resolveType().isPrimitive("number")) {
      analysisResult.errors.push(AnalysisError({
        message:
          "You tried to use a numeric operation on something that is not a number.",
        beginHighlight: this,
        endHighlight: None(),
        messageHighlight: `"${this.token.text}" can not be used as a number.`,
      }));
    }
    return analysisResult;
  }

  evaluate(): SymbolValue<number> {
    // Type safety has been assured by static analysis
    return this.child.evaluate() as SymbolValue<number>;
  }

  resolveType(): SymbolType {
    return new PrimitiveSymbolType("number");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return this.child.tokenRange();
  }
}

/* Numeric expression */

type NumericExpressionAstNode = EvaluableAstNode<SymbolValue<number>>;

/* PARSER */

// Forward declaration of exported top-level rule
export const numericExpression = rule<TokenKind, NumericExpressionAstNode>();

const literal = apply(
  tok(TokenKind.numeric_literal),
  (literal): NumericLiteralAstNode =>
    new NumericLiteralAstNode({
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
    new UnaryNumericExpressionAstNode({
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
  (node) =>
    new AmbiguouslyTypedExpressionAstNode({
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
      new BinaryNumericExpressionAstNode({
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
    new BinaryNumericExpressionAstNode({
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
