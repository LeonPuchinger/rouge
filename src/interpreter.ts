import { AstNode, AstNodeType } from "./ast.ts";
import {
  Symbol,
  SymbolTable,
  SymbolType,
  SymbolValue,
  SymbolValueType,
} from "./symbol.ts";
import { AppError, InternalError } from "./util/error.ts";
import { None, Some } from "./util/monad/index.ts";
import { Option } from "./util/monad/option.ts";

const table = new SymbolTable();

// TODO: error handling: multiple cases are essentially testing the same thing here
// idea: use some sort of assert call that triggers a panic if its cond. is not met
function handleAssign(node: AstNode): Option<AppError> {
  if (node.children.length !== 2) {
    return Some(
      InternalError(
        "Assignments always have to have two AST nodes as children",
      ),
    );
  }
  if (node.child(0)?.nodeType !== AstNodeType.ident) {
    return Some(
      InternalError("Assignments always need to be done to a variable."),
    );
  }
  if (node.child(1)?.nodeType !== AstNodeType.int_literal) {
    return Some(
      InternalError("Variables can only be assigned integers right now"),
    );
  }
  const identNode = node.child(0)!;
  if (identNode.value.kind === "none") {
    return Some(InternalError("AST node does not have a value"));
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
  return None();
}

export function interpret(node: AstNode): Option<AppError> {
  switch (node.nodeType) {
    case AstNodeType.assign:
      return handleAssign(node);
    case AstNodeType.ident:
      break;
    case AstNodeType.int_literal:
      break;
    case AstNodeType.expressions:
      for (const child of node.children) {
        const result = interpret(child);
        if (result.kind === "some") {
          return result;
        }
      }
      break;
  }
  return None();
}
