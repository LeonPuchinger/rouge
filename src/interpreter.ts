import * as ast from "./ast.ts";
import { RuntimeSymbol, runtimeTable } from "./symbol.ts";
// required for extension methods to be usable
import {} from "./util/array.ts";

export function interpretExpression(
  node: ast.ExpressionAstNode,
): void {
  node.evaluate();
}

export function interpretAssign(node: ast.AssignAstNode): void {
  const ident = node.token.text;
  runtimeTable.setSymbol(
    ident,
    new RuntimeSymbol({
      node: node.child,
      value: node.child.evaluate(),
    }),
  );
}

export function interpretStatements(
  node: ast.StatementsAstNode,
): void {
  node.children.forEach((child) => {
    child.interpret();
  });
}

export const interpret = (node: ast.AST) => node.interpret();
