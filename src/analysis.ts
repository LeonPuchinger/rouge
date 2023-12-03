import * as ast from "./ast.ts";
import { AnalysisError, AnalysisFinding } from "./finding.ts";
import {
  AnalysisSymbolTable,
  StaticSymbol,
  SymbolKind,
  SymbolTable,
  SymbolValueKind,
} from "./symbol.ts";
import { Err, None, Ok, Result } from "./util/monad/index.ts";
import { concatLines } from "./util/string.ts";

const table: AnalysisSymbolTable = new SymbolTable();

export type AnalysisResult<T> = Result<
  {
    value: T;
    warnings: AnalysisFinding[];
  },
  {
    warnings: AnalysisFinding[];
    errors: AnalysisFinding[];
  }
>;

export type CheckResult = Result<
  {
    warnings: AnalysisFinding[];
  },
  {
    warnings: AnalysisFinding[];
    errors: AnalysisFinding[];
  }
>;

function emptyFindings(): {
  warnings: AnalysisFinding[];
  errors: AnalysisFinding[];
} {
  return {
    warnings: [],
    errors: [],
  };
}

export function analyzeInteger(
  _node: ast.IntegerAstNode,
): AnalysisResult<SymbolValueKind> {
  return Ok({ value: SymbolValueKind.number, warnings: [] });
}

export function analyzeIdentifierExpression(
  node: ast.IdentifierExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const ident = node.child.value;
  return table.findSymbol(ident)
    .ok_or({
      errors: [
        AnalysisError({
          message:
            "You tried to use a variable that has not been defined at this point in the program.",
          beginHighlight: node.child,
          endHighlight: None(),
          messageHighlight: `Variable "${ident}" is unknown at this point.`,
        }),
      ],
      warnings: [],
    })
    .map((symbol) => ({ value: symbol.valueKind, warnings: [] }));
}

export function checkAssign(
  node: ast.AssignAstNode,
): CheckResult {
  const findings = emptyFindings();
  const ident = node.lhs.value;
  const expressionResult = node.rhs.analyze();
  if (expressionResult.kind === "err") {
    return expressionResult;
  }
  const expressionKind = expressionResult.unwrap().value;
  const existing = table.findSymbol(ident);
  if (existing.kind === "some") {
    if (existing.unwrap().valueKind !== expressionKind) {
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
      return Err(findings);
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
  return Ok(findings);
}

export function checkExpression(
  node: ast.ExpressionAstNode,
): CheckResult {
  return node.analyze();
}

export function checkStatements(
  node: ast.StatementAstNodes,
): CheckResult {
  // TODO: find better way to consolidate results (e.g. with more well suited monad operations)
  const results = node.children.flatMap((statement) => statement.check());
  const errors = results
    .filter((statement) => statement.kind === "err")
    .flatMap((statement) => statement.unwrapError().errors);
  const warnings = results
    .filter((statement) => statement.kind === "ok")
    .flatMap((statement) => statement.unwrapError().warnings);
  if (errors.length > 0) {
    return Err({
      warnings: warnings,
      errors: errors,
    });
  }
  return Ok({
    warnings: warnings,
  });
}

export const analyze = (node: ast.AST) => node.check();
