import * as ast from "./ast.ts";
import { AnalysisFindings } from "./finding.ts";

export function checkExpression(
  node: ast.ExpressionAstNode,
): AnalysisFindings {
  return node.analyze();
}

// TODO: move to an appropriate file
export const analyze = (node: ast.AST) => node.check();
