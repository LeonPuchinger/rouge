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
import { AppError, InternalError } from "./util/error.ts";
import { None, Ok, Option, Result, Some } from "./util/monad/index.ts";

const table = new SymbolTable();

export function handleIdentifier(
  node: ast.IdentifierAstNode,
): Result<SymbolValue<string>, AppError> {
  return Ok(
    new SymbolValue({
      valueType: SymbolValueType.identifier,
      value: node.value,
    }),
  );
}

export function handleInteger(
  node: ast.IntegerAstNode,
): Result<SymbolValue<number>, AppError> {
  return Ok(
    new SymbolValue({
      valueType: SymbolValueType.number,
      value: node.value,
    }),
  );
}

export function handleAssign(node: ast.AssignAstNode): Option<AppError> {
  const identResult = node.lhs.evaluate();
  if (identResult.kind === "err") {
    return identResult.err();
  }
  const ident = identResult.unwrap();
  const expressionResult = node.rhs.evaluate();
  if (expressionResult.kind === "err") {
    return expressionResult.err();
  }
  let expression = expressionResult.unwrap();
  // identifiers need to be resolved in the symbol table
  if (expression.valueType === SymbolValueType.identifier) {
    const existing = table.findSymbol(expression.value as string);
    if (existing.kind === "none") {
      return Some(
        InternalError(
          "Could not resolve identifier that",
          "This should have been checked during static analysis.",
        ),
      );
    }
    expression = existing.unwrap().value;
  }
  table.setSymbol(
    ident.value,
    new Symbol({
      symbolType: SymbolType.variable,
      node: node.rhs,
      value: new SymbolValue({
        value: expression,
        // TODO: check whether the symbol that already exists (if it does)
        // has the correct type (Static Analysis
        valueType: SymbolValueType.number,
      }),
    }),
  );
  return None();
}

export function handleStatements(
  node: ast.StatementAstNodes,
): Option<AppError> {
  return node.children.mapUntil(
    (node) => node.interpret(),
    (result) => result.kind === "some",
    None(),
  );
}

export const interpret = (node: ast.AST) => node.interpret();
