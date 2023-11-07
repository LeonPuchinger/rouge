import * as ast from "./ast.ts";
import {
  Symbol,
  SymbolTable,
  SymbolType,
  SymbolValue,
  SymbolValueType,
} from "./symbol.ts";
// required for extension methods to be usable
import { } from "./util/array.ts";
import { AppError } from "./util/error.ts";
import { None, Ok, Option, Result } from "./util/monad/index.ts";

const table = new SymbolTable();

export function handleIdentifier(
  node: ast.IdentifierAstNode,
): Result<string, AppError> {
  return Ok(node.value);
}

export function handleInteger(
  node: ast.IntegerAstNode,
): Result<number, AppError> {
  return Ok(node.value);
}

export function handleAssign(node: ast.AssignAstNode): Option<AppError> {
  const ident = node.lhs.interpret();
  if (ident.kind === "err") {
    return ident.err();
  }
  const value = node.rhs.interpret();
  if (value.kind === "err") {
    return value.err();
  }
  table.setSymbol(
    ident.unwrap(),
    new Symbol({
      symbolType: SymbolType.variable,
      node: node.rhs,
      value: new SymbolValue({
        value: value.unwrap(),
        // TODO: let the expression return the result
        // this way, the expression can have any type.
        // TODO: check whether the symbol that already exists (if it does)
        // has the correct type (Static Analysis
        valueType: SymbolValueType.number,
      }),
    }),
  );
  return None();
}

export function handleExpression(
  node: ast.ExpressionAstNode,
): Option<AppError> {
  // TODO: find out whether it's typescript or me that's stupid
  // result: both
  switch (node.kind) {
    case "AssignAstNode":
      return handleAssign(node);
  }
  return None();
}

function handleStatements(node: ast.StatementAstNodes): Option<AppError> {
  return node.mapUntil(
    (node) => handleExpression(node),
    (result) => result.kind === "some",
    None(),
  );
}

export const interpret = (node: ast.AST) => handleExpressions(node);
