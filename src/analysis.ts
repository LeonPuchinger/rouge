import * as ast from "./ast.ts";
import { AnalysisError, AnalysisFinding } from "./finding.ts";
import {
  AnalysisSymbolTable,
  StaticSymbol,
  SymbolKind,
  SymbolTable,
  SymbolValueKind,
} from "./symbol.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

const table: AnalysisSymbolTable = new SymbolTable();

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

export function analyzeInteger(
  _node: ast.IntegerAstNode,
): AnalysisResult<SymbolValueKind> {
  return {
    value: Some(SymbolValueKind.number),
    warnings: [],
    errors: [],
  };
}

export function analyzeIdentifierExpression(
  node: ast.IdentifierExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const ident = node.child.value;
  const findings: AnalysisResult<SymbolValueKind> = {
    value: table.findSymbol(ident)
      .map((symbol) => symbol.valueKind),
    warnings: [],
    errors: [],
  };
  findings.value.onNone(() => {
    findings.errors.push(
      AnalysisError({
        message:
          "You tried to use a variable that has not been defined at this point in the program.",
        beginHighlight: node.child,
        endHighlight: None(),
        messageHighlight: `Variable "${ident}" is unknown at this point.`,
      }),
    );
  });
  return findings;
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
  table.findSymbol(ident)
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
      table.setSymbol(
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
