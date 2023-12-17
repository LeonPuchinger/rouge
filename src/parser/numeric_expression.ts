import { alt_sc, apply, kmid, Parser, rule, str, tok } from "typescript-parsec";
import * as analysis from "../analysis.ts";
import * as ast from "../ast.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";

export const numericExpression = rule<TokenType, ast.NumberAstNode>();

const parenthesized: Parser<TokenType, ast.NumberAstNode> = kmid(
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
    parenthesized,
    literal,
  ),
);
