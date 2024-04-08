import * as ast from "./ast.ts";
import { AnalysisFindings } from "./finding.ts";

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
    .reduce((previous, current) => AnalysisFindings.merge(previous, current));
}

export const analyze = (node: ast.AST) => node.check();
