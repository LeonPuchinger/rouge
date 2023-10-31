import { UncheckedAstNode } from "./ast.ts";
import { AppError, InternalError } from "./util/error.ts";
import { Err, Ok, Result } from "./util/monad/index.ts";

interface CheckedAssignmentAstNode {
  to: UncheckedAstNode; // TODO: replace with checked ident node
  from: UncheckedAstNode; // TODO: replace with checked expr node
}

export function checkAssignment(
  unchecked: UncheckedAstNode,
): Result<CheckedAssignmentAstNode, AppError> {
  // TODO: make this check redundant by using a binary version of the generic AST node
  if (unchecked.children.length !== 2) {
    return Err(InternalError(
      "The AST node of an assignment had ",
    ));
  }
  return Ok({
    to: unchecked.childOrPanic(0),
    from: unchecked.childOrPanic(1),
  });
}
