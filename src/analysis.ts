import * as ast from "./ast.ts";
import {
  AnalysisSymbolTable,
  StaticSymbol,
  SymbolKind,
  SymbolTable,
} from "./symbol.ts";
import { AppError, InterpreterError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

const table: AnalysisSymbolTable = new SymbolTable();

export function analyzeAssign(
  node: ast.AssignAstNode,
): Option<AppError> {
  const identResult = node.lhs.evaluate();
  if (identResult.kind === "err") {
    return identResult.err();
  }
  const ident = identResult.unwrap();
  const expressionResult = node.rhs.evaluate();
  if (expressionResult.kind === "err") {
    return expressionResult.err();
  }
  const expression = expressionResult.unwrap();
  const existing = table.findSymbol(ident);
  if (existing.kind === "some") {
    if (existing.unwrap().valueKind !== expression.valueKind) {
      return Some(
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
      );
    }
  } else {
    table.setSymbol(
      ident,
      new StaticSymbol({
        symbolKind: SymbolKind.variable,
        valueKind: expression.valueKind,
      }),
    );
  }
  return None();
}
