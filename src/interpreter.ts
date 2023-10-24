import { AstNode, AstNodeType } from "./ast.ts";
import {
  Symbol,
  SymbolTable,
  SymbolType,
  SymbolValue,
  SymbolValueType,
} from "./symbol.ts";
import { AppError, assert, InterpreterError } from "./util/error.ts";
import { None, Some } from "./util/monad/index.ts";
import { Option } from "./util/monad/option.ts";

const table = new SymbolTable();

function handleAssign(node: AstNode): Option<AppError> {
  assert(
    node.children.length === 2,
    "Assignment AST nodes always have to have two AST nodes as their children",
  );
  if (node.child(0)?.nodeType !== AstNodeType.ident) {
    return Some(InterpreterError(
      "Assignments always need to be done to a variable",
      node.childOrPanic(0),
      Some(node.child(1)),
      None(),
    ));
  }
  if (node.child(1)?.nodeType !== AstNodeType.int_literal) {
    return Some(
      InterpreterError(
        "Variables can only be assigned integers right now",
        node.childOrPanic(0),
        Some(node.child(1)),
        None(),
      ),
    );
  }
  const identNode = node.child(0)!;
  assert(
    identNode.value.kind !== "none",
    "AST node has an empty value",
  );
  const ident = identNode.value.unwrap() as string;
  const valueNode = node.child(1)!;
  assert(
    valueNode.value.kind !== "none",
    "AST node has an empty value",
  );
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
