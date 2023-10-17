import { AstNode, AstNodeType } from "./ast.ts";
import {
  Symbol,
  SymbolTable,
  SymbolType,
  SymbolValue,
  SymbolValueType,
} from "./symbol.ts";
import { AppError, assert, InternalError } from "./util/error.ts";
import { None, Some } from "./util/monad/index.ts";
import { Option } from "./util/monad/option.ts";

const table = new SymbolTable();

function handleAssign(node: AstNode): Option<AppError> {
  assert(
    node.children.length === 2,
    "Assignment AST nodes always have to have two AST nodes as their children",
  );
  if (node.child(0)?.nodeType !== AstNodeType.ident) {
    return Some(
      // TODO: transition to different error type
      // This is an error that is supposed to reach the user of the language.
      // The interpreter itself has done nothing wrong.
      // The error is solely caused by the users input (the program).
      // A type of error needs to be generated which can be displayed to the user.
      // The error could take the AST node(s) and generate a snippet for the error message.
      // Additionally, consider removing InternalError altogether, use panic/assert if something
      // in the interpreter itself goes wrong as those errors are not recoverable from the
      // perspective of the user.
      InternalError("Assignments always need to be done to a variable."),
    );
  }
  if (node.child(1)?.nodeType !== AstNodeType.int_literal) {
    return Some(
      // TODO: transition to different error type, see comment above
      InternalError("Variables can only be assigned integers right now."),
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
