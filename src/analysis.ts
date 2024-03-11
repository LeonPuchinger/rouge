import * as ast from "./ast.ts";
import { AnalysisError, AnalysisFinding } from "./finding.ts";
import { AnalysisSymbolTable, StaticSymbol, SymbolTable } from "./symbol.ts";
import { emptyFindings } from "./util/finding.ts";
import { None, Option } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

export const analysisTable: AnalysisSymbolTable = new SymbolTable();

export type AnalysisResult<T> = {
  value: Option<T>;
  warnings: AnalysisFinding[];
  errors: AnalysisFinding[];
};

export type AnalysisFindings = Omit<AnalysisResult<unknown>, "value">;

export function checkAssign(
  node: ast.AssignAstNode,
): AnalysisFindings {
  const findings = emptyFindings();
  const ident = node.token.text;
  const expressionResult = node.child.analyze();
  if (expressionResult.value.kind === "none") {
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
          beginHighlight: node,
          endHighlight: None(),
        }),
      );
    })
    .onNone(() => {
      analysisTable.setSymbol(
        ident,
        new StaticSymbol({
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
  node: ast.StatementsAstNode,
): AnalysisFindings {
  return node.children
    .map((statement) => statement.check())
    .reduce((previous, current) => ({
      warnings: [...previous.warnings, ...current.warnings],
      errors: [...previous.errors, ...current.errors],
    }));
}

export const analyze = (node: ast.AST) => node.check();
