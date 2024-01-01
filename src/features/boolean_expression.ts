import { apply, tok, Token } from "typescript-parsec";
import { AnalysisResult } from "../analysis.ts";
import * as ast from "../ast.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError } from "../util/error.ts";
import { Ok, Result, Some } from "../util/monad/index.ts";

/* AST NODES */

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

type BooleanExpressionAstNode = ast.EvaluableAstNode<SymbolValue<boolean>>;

/* PARSER */

const literal = apply(
  tok(TokenType.boolean_literal),
  (token) =>
    createBooleanLiteralAstNode({
      token: token,
      value: token.text === "true",
    }),
);
