import {
  alt_sc,
  apply,
  expectEOF,
  list_sc,
  seq,
  tok,
} from "typescript-parsec";
import * as analysis from "../analysis.ts";
import * as ast from "../ast.ts";
import * as interpreter from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { _ } from "../parser.ts";

const literal = apply(
  tok(TokenType.numeric_literal),
  (literal): ast.NumberAstNode => ({
    token: literal,
    value: parseFloat(literal.text),
    evaluate() {
      return interpreter.evaluateNumber(this);
    },
    analyze() {
      return analysis.analyzeNumber(this);
    }
  }),
);
