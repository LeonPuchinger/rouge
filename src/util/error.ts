import { AstNode } from "../ast.ts";
import { accessEnvironment } from "./environment.ts";
import { Option, Some } from "./monad/index.ts";
import { createSnippet } from "./snippet.ts";
import { concatLines, toMultiline } from "./string.ts";
import { Attributes } from "./type.ts";

/**
 * Panics when the given boolean equals to `false`
 *
 * @param test The boolean deciding whether to panic or not.
 * @param message A message that is displayed along with the error in case of a panic.
 */
export function assert(
  test: boolean,
  message: string,
) {
  if (!test) {
    throw new InternalError(`assertion failed: ${message}`);
  }
}

export interface AppError {
  toString: () => string;
}

/**
 * A type of error that is the result of internal behavior
 * of the implementation of the language, not the user's input.
 *
 * A type of error that is the result of internal behavior of the interpreter.
 * This error is never the result of the users input.
 *
 * Example:
 * Evaluable AST nodes require that static analysis is performed ahead of resolving the type of the node.
 * This error is thrown when the interpreter detects that those two methods have been called in the wrong order.
 */
export class InternalError extends Error implements AppError {
  /**
   * @param message A concise summary of the error.
   * @param extendedMessage Additional information about the error.
   */
  constructor(public message: string, public extendedMessage: string = "") {
    super(concatLines(message, extendedMessage));
    this.message = message;
    this.extendedMessage = extendedMessage;
  }

  toString(): string {
    return toMultiline(
      "INTERNAL ERROR: The language/interpreter reached an internal state which does not allow it to continue running.",
      "This error is not the result of the users input but an issue with the language itself and needs to be fixed.",
      "Please submit an issue at 'github.com/LeonPuchinger/rouge/issues' with this entire error message attached.",
      "Detailed information:",
      `${this.stack ?? ""}`,
    );
  }
}

/**
 * A type of error that is the result of the users input and represents expected behavior.
 * The message contains a snippet of the affected input as well as
 * a header message and an optional message attached to the affected area.
 * The snippet contains three lines of padding around the highlighted snippet.
 */
export class RuntimeError extends Error implements AppError {
  message!: string;
  beginHighlight!: AstNode;
  endHighlight!: Option<AstNode>;
  messageHighlight!: string;

  /**
   * @param message Header text to display at the top of the error message.
   * @param beginHighlight The AST node where the snippet begins.
   * @param endHighlight The AST node where the snippet should end. The end of the line if None.
   * @param messageHighlight A message to attach to the highlighted section of code.
   */
  constructor(
    params: Omit<Attributes<RuntimeError>, "cause" | "name" | "stack">,
  ) {
    super(params.message);
    Object.assign(this, params);
  }

  toString() {
    return toMultiline(
      this.message,
      createSnippet(
        accessEnvironment("source"),
        this.beginHighlight.tokenRange()[0].pos,
        this.endHighlight.map((node) => node.tokenRange()[1].pos),
        3,
        Some(this.messageHighlight),
      ),
    );
  }
}
