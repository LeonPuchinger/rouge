import * as ast from "./ast.ts";
import { AnalysisError, AnalysisFinding } from "./finding.ts";
import { AnalysisSymbolTable, StaticSymbol, SymbolTable } from "./symbol.ts";
import { emptyFindings, mergeFindings } from "./util/finding.ts";
import { None, Option } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

export const analysisTable: AnalysisSymbolTable = new SymbolTable();

// TODO: remove
export type AnalysisResult<T> = {
  value: Option<T>;
  warnings: AnalysisFinding[];
  errors: AnalysisFinding[];
};

export interface AnalysisFindings {
  warnings: AnalysisFinding[];
  errors: AnalysisFinding[];
  isErroneous: () => boolean;
}

export function checkAssign(
  node: ast.AssignAstNode,
): AnalysisFindings {
  const findings = emptyFindings();
  const ident = node.token.text;
  mergeFindings(findings, node.child.analyze());
  if (findings.isErroneous()) {
    return findings;
  }
  const expressionType = node.child.resolveType();
  analysisTable.findSymbol(ident)
    .then((existing) => {
      if (existing.valueKind === expressionType) {
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
          valueKind: expressionType,
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
      isErroneous: previous.isErroneous,
    }));
}

export const analyze = (node: ast.AST) => node.check();
