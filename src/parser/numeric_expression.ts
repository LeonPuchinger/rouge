import {
  alt_sc,
  apply,
  kmid,
  nil,
  Parser,
  str,
  tok,
} from "typescript-parsec";
import * as analysis from "../analysis.ts";
import * as ast from "../ast.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { _ } from "../parser.ts";

// TODO: find a better way to do forward declarations
export let numericExpression: Parser<TokenType, ast.NumberAstNode> = nil();

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

numericExpression = alt_sc(
  parenthesized,
  literal,
);
