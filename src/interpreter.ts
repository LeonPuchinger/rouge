import * as ast from "./ast.ts";
// required for extension methods to be usable
import {} from "./util/array.ts";

export function interpretExpression(
  node: ast.ExpressionAstNode,
): void {
  node.evaluate();
}

export function interpretStatements(
  node: ast.StatementsAstNode,
): void {
  node.children.forEach((child) => {
    child.interpret();
  });
}

export const interpret = (node: ast.AST) => node.interpret();
