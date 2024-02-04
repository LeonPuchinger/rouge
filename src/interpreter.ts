import * as ast from "./ast.ts";
import {
  InterpreterSymbolTable,
  RuntimeSymbol,
  SymbolTable,
} from "./symbol.ts";
// required for extension methods to be usable
import {} from "./util/array.ts";
import { AppError } from "./util/error.ts";
import { None, Option } from "./util/monad/index.ts";

export const runtimeTable: InterpreterSymbolTable = new SymbolTable();

export function interpretExpression(
  node: ast.ExpressionAstNode,
): Option<AppError> {
  return node.evaluate().err();
}

export function interpretAssign(node: ast.AssignAstNode): Option<AppError> {
  const ident = node.token.text;
  const expressionResult = node.child.evaluate();
  if (expressionResult.kind === "err") {
    return expressionResult.err();
  }
  runtimeTable.setSymbol(
    ident,
    new RuntimeSymbol({
      node: node.child,
      value: expressionResult.unwrap(),
    }),
  );
  return None();
}

export function interpretStatements(
  node: ast.StatementAstNodes,
): Option<AppError> {
  return node.children.mapUntil(
    (node) => node.interpret(),
    (result) => result.kind === "some",
    None(),
  );
}

export const interpret = (node: ast.AST) => node.interpret();
