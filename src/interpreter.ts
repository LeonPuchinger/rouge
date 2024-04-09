import * as ast from "./ast.ts";
// required for extension methods to be usable
import {} from "./util/array.ts";

export function interpretExpression(
  node: ast.ExpressionAstNode,
): void {
  node.evaluate();
}

// TODO: move to an appropriate file
export const interpret = (node: ast.AST) => node.interpret();
