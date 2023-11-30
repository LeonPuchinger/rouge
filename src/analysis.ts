import * as ast from "./ast.ts";
import {
  AnalysisSymbolTable,
  StaticSymbol,
  SymbolKind,
  SymbolTable,
  SymbolValueKind,
} from "./symbol.ts";
import { AppError, InterpreterError } from "./util/error.ts";
import { None, Ok, Result } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

const table: AnalysisSymbolTable = new SymbolTable();

export function analyzeInteger(
  _node: ast.IntegerAstNode,
): Result<SymbolValueKind, AppError[]> {
  return Ok(SymbolValueKind.number);
}

export function analyzeIdentifierExpression(
  node: ast.IdentifierExpressionAstNode,
): Result<SymbolValueKind, AppError[]> {
  const ident = node.child.value;
  return table.findSymbol(ident)
    .map((symbol) => symbol.valueKind)
    .ok_or([InterpreterError(
      "You tried to use a variable that has not been defined at this point in the program.",
      node.child,
      None(),
      `Variable "${ident}" is unknown at this point.`,
    )]);
}

export function analyzeAssign(
  node: ast.AssignAstNode,
): AppError[] {
  const ident = node.lhs.value;
  const expressionResult = node.rhs.analyze();
  if (expressionResult.kind === "err") {
    return expressionResult.unwrapError();
  }
  const expressionKind = expressionResult.unwrap();
  const existing = table.findSymbol(ident);
  if (existing.kind === "some") {
    if (existing.unwrap().valueKind !== expressionKind) {
      return [
        InterpreterError(
          concatLines(
            `You tried setting the variable '${ident}' to a value that is incompatible with the variables type.`,
            "When a variable is created its type is set in stone.",
            "This means, that afterwards the variable can only be set to values with the same type.",
            "A variable is created the first time a value is assigned to it.",
          ),
          node.lhs,
          None(),
        ),
      ];
    }
  } else {
    table.setSymbol(
      ident,
      new StaticSymbol({
        symbolKind: SymbolKind.variable,
        valueKind: expressionKind,
      }),
    );
  }
  return [];
}

export function checkExpression(
  node: ast.ExpressionAstNode,
): AppError[] {
  return node.analyze().unwrapErrorOr([]);
}

export function checkStatements(
  node: ast.StatementAstNodes,
): AppError[] {
  return node.children.flatMap((statement) => statement.check());
}

export const analyze = (node: ast.AST) => node.check();
