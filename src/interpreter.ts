import { AstNode, AstNodeType } from "./ast.ts";
import {
  Symbol,
  SymbolTable,
  SymbolType,
  SymbolValue,
  SymbolValueType,
} from "./symbol.ts";

const table = new SymbolTable();

// TODO: error handling: multiple cases are essentially testing the same thing here
// idea: use some sort of assert call that triggers a panic if its cond. is not met
function handleAssign(node: AstNode) {
  if (node.children.length !== 2) {
    // TODO: error handling, assign always has two nodes
  }
  if (node.child(0)?.nodeType !== AstNodeType.ident) {
    // TODO: error handling, always have to assign to an identifier
  }
  if (node.child(1)?.nodeType !== AstNodeType.int_literal) {
    // TODO: error handling, (right now), variables can only be assigned integers
  }
  const identNode = node.child(0)!;
  if (identNode.value.kind === "none") {
    // TODO: error handling, safety, parser seems to have screwed up setting the value
  }
  const ident = identNode.value.unwrap() as string;
  const valueNode = node.child(1)!;
  if (valueNode.value.kind === "none") {
    // TODO: error handling, safety, parser seems to have screwed up setting the value
  }
  const value = valueNode.value.unwrap() as number;
  table.setSymbol(
    ident,
    new Symbol({
      symbolType: SymbolType.variable,
      node: valueNode,
      value: new SymbolValue({
        value: value,
        valueType: SymbolValueType.number,
      }),
    }),
  );
}

export function interpret(node: AstNode) {
  switch (node.nodeType) {
    case AstNodeType.assign:
      return handleAssign(node);
    case AstNodeType.ident:
      break;
    case AstNodeType.int_literal:
      return;
    case AstNodeType.expressions:
      node.children.forEach((child) => interpret(child));
      return;
  }
  // Using preorder to traverse AST
}
