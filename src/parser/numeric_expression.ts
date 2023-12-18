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
import * as analysis from "../analysis.ts";
import * as ast from "../ast.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";

type EvaluatesToNumber = ast.EvaluableAstNode<SymbolValue<number>>;

export type BinaryNumericExpressionAstNode =
  & ast.BinaryAstNode<EvaluatesToNumber, EvaluatesToNumber>
  & ast.TokenAstNode
  & EvaluatesToNumber;

export const numericExpression = rule<TokenType, EvaluatesToNumber>();

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
      // TODO: implement
    },
    analyze() {
      // TODO: implement
    },
  }),
);

const parenthesized: Parser<TokenType, EvaluatesToNumber> = kmid(
  str("("),
  numericExpression,
  str(")"),
);

const literal = apply(
  tok(TokenType.numeric_literal),
  (literal): ast.NumberAstNode => ({
    token: literal,
    value: parseFloat(literal.text),
    evaluate() {
      return interpreter.evaluateNumericLiteral(this);
    },
    analyze() {
      return analysis.analyzeNumericLiteral(this);
    },
  }),
);

numericExpression.setPattern(
  alt_sc(
    binaryOperation,
    parenthesized,
    literal,
  ),
);
