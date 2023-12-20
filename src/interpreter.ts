import * as ast from "./ast.ts";
import {
  InterpreterSymbolTable,
  RuntimeSymbol,
  SymbolKind,
  SymbolTable,
  SymbolValue,
  SymbolValueKind,
} from "./symbol.ts";
// required for extension methods to be usable
import {} from "./util/array.ts";
import { AppError, InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";

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
  let expression = expressionResult.unwrap();
  // identifiers need to be resolved in the symbol table
  if (expression.valueKind === SymbolValueKind.identifier) {
    const existing = runtimeTable.findSymbol(expression.value as string);
    if (existing.kind === "none") {
      return Some(
        InternalError(
          `Could not resolve identifier "${ident}"`,
          "This should have been checked during static analysis.",
        ),
      );
    }
    expression = existing.unwrap().value;
  }
  runtimeTable.setSymbol(
    ident,
    new RuntimeSymbol({
      symbolKind: SymbolKind.variable,
      node: node.child,
      value: new SymbolValue({
        value: expression,
        valueKind: SymbolValueKind.number,
      }),
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
