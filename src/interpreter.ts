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
import { Err, None, Ok, Option, Result, Some } from "./util/monad/index.ts";

const table: InterpreterSymbolTable = new SymbolTable();

export function evaluateIdentifier(
  node: ast.IdentifierAstNode,
): Result<string, AppError> {
  return Ok(node.value);
}

export function evaluateInteger(
  node: ast.IntegerAstNode,
): Result<SymbolValue<number>, AppError> {
  return Ok(
    new SymbolValue({
      valueKind: SymbolValueKind.number,
      value: node.value,
    }),
  );
}

export function evaluateExpression(
  node: ast.ExpressionAstNode,
): Result<SymbolValue<unknown>, AppError> {
  const evaluationResult = node.child.evaluate();
  if (evaluationResult.kind === "err") {
    // repackage result for type safety
    return Err(evaluationResult.unwrapError());
  }
  const evaluatedExpression = evaluationResult.unwrap();
  if (typeof evaluatedExpression === "string") {
    // expression is an identifier, needs to be resolved first
    return table.findSymbol(evaluatedExpression).map((symbol) => symbol.value)
      .ok_or(InternalError(
        `Unable to resolve symbol ${evaluatedExpression}.`,
        "This should have been caught during static analysis.",
      ));
  }
  return Ok(evaluatedExpression);
}

export function interpretExpression(
  node: ast.ExpressionAstNode,
): Option<AppError> {
  return node.child.evaluate().err();
}

export function interpretAssign(node: ast.AssignAstNode): Option<AppError> {
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
  if (expression.valueKind === SymbolValueKind.identifier) {
    const existing = table.findSymbol(expression.value as string);
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
  table.setSymbol(
    ident,
    new RuntimeSymbol({
      symbolKind: SymbolKind.variable,
      node: node.rhs,
      value: new SymbolValue({
        value: expression,
        // TODO: check whether the symbol that already exists (if it does)
        // has the correct type (Static Analysis)
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
