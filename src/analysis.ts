import * as ast from "./ast.ts";
import { AnalysisError, AnalysisFinding } from "./finding.ts";
import {
  AnalysisSymbolTable,
  StaticSymbol,
  SymbolKind,
  SymbolTable,
} from "./symbol.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

export const analysisTable: AnalysisSymbolTable = new SymbolTable();

export type AnalysisResult<T> = {
  value: Option<T>;
  warnings: AnalysisFinding[];
  errors: AnalysisFinding[];
};

export type AnalysisFindings = Omit<AnalysisResult<unknown>, "value">;

function emptyFindings(): AnalysisFindings {
  return {
    warnings: [],
    errors: [],
  };
}

export function checkAssign(
  node: ast.AssignAstNode,
): AnalysisFindings {
  const findings = emptyFindings();
  const ident = node.lhs.value;
  const expressionResult = node.rhs.analyze();
  if (expressionResult.value.kind === "some") {
    return expressionResult;
  }
  const expressionKind = expressionResult.value.unwrap();
  analysisTable.findSymbol(ident)
    .then((existing) => {
      if (existing.valueKind === expressionKind) {
        return;
      }
      findings.errors.push(
        AnalysisError({
          message: concatLines(
            `You tried setting the variable '${ident}' to a value that is incompatible with the variables type.`,
            "When a variable is created its type is set in stone.",
            "This means, that afterwards the variable can only be set to values with the same type.",
            "A variable is created the first time a value is assigned to it.",
          ),
          beginHighlight: node.lhs,
          endHighlight: None(),
        }),
      );
    })
    .onNone(() => {
      analysisTable.setSymbol(
        ident,
        new StaticSymbol({
          symbolKind: SymbolKind.variable,
          valueKind: expressionKind,
        }),
      );
    });
  return findings;
}

export function checkExpression(
  node: ast.ExpressionAstNode,
): AnalysisFindings {
  return node.analyze();
}

export function checkStatements(
  node: ast.StatementAstNodes,
): AnalysisFindings {
  return node.children
    .map((statement) => statement.check())
    .reduce((previous, current) => ({
      warnings: [...previous.warnings, ...current.warnings],
      errors: [...previous.errors, ...current.errors],
    }));
}

export const analyze = (node: ast.AST) => node.check();
