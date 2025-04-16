import { AstNode } from "../ast.ts";
import { accessEnvironment } from "./environment.ts";
import { Option, Some } from "./monad/index.ts";
import { createSnippet } from "./snippet.ts";
import { concatLines, toMultiline } from "./string.ts";
import { WithOptionalAttributes } from "./type.ts";

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
  constructor(
    public override message: string,
    public extendedMessage: string = "",
  ) {
    super(concatLines(message, extendedMessage));
    this.message = message;
    this.extendedMessage = extendedMessage;
  }

  override toString(): string {
    return toMultiline(
      "INTERNAL ERROR: The language/interpreter reached an internal state which does not allow it to continue running.",
      "This error is not the result of the users input but an issue with the language itself and needs to be fixed.",
      "Please submit an issue at 'github.com/LeonPuchinger/rouge/issues' with this entire error message attached.",
      "Detailed information:",
      `${this.stack ?? ""}`,
    );
  }
}

// shorthand internal error types:

export function UnresolvableSymbolTypeError(): InternalError {
  return new InternalError(
    "A symbol type could not be resolved which should have been discovered during static analysis.",
    "It is likely, that static analysis has not been performed before resolving the type.",
  );
}

/**
 * A type of error that is the result of the users input and represents expected behavior.
 * The message contains a snippet of the affected input source code as well as a header message.
 * Additionally, a segment within the affected area can be highlighted with another message.
 * The snippet contains three lines of padding around the affected area of source code.
 */
export class RuntimeError extends Error implements AppError {
  include!: [AstNode, AstNode] | [AstNode];
  override message!: string;
  highlight: Option<[AstNode, AstNode] | [AstNode]>;
  highlightMessage: Option<string>;

  /**
   * @param include The range of AST nodes that mark the affected area (can be just one AST node wide).
   * @param message Header text to display at the top of the error message.
   * @param highlight The range of AST nodes that mark the highlighted area (can be just one AST node wide).
   * @param highlightMessage A message attached to the highlighted section of code.
   */
  constructor(
    params: Omit<
      WithOptionalAttributes<RuntimeError>,
      "cause" | "name" | "stack"
    >,
  ) {
    super(params.message);
    Object.assign(this, params);
    this.highlight = Some(params.highlight);
    this.highlightMessage = Some(params.highlightMessage);
  }

  override toString(): string {
    return toMultiline(
      this.message,
      createSnippet(
        accessEnvironment("source"),
        this.include[0].tokenRange()[0].pos,
        Some(this.include.at(1))
          .map((node) => node.tokenRange()[1].pos),
        this.highlight
          .map((range) => range[0])
          .map((node) => node.tokenRange()[0].pos),
        this.highlight
          .map((range) => range.at(1))
          .map((node) => node.tokenRange()[1].pos),
        3,
        this.highlightMessage,
      ),
    );
  }
}

/**
 * Similar to `RuntimeError`, but features a simpler interface and does not produce a snippet.
 * A `PanicError` is an unrecoverable error that is the result of the users input.
 * It represents expected behavior and is not the result of erroneous internal behavior of the interpreter.
 * Throwing a `PanicError` is supposed to terminate the execution of the interpreter.
 */
export class PanicError extends Error implements AppError {
  constructor(
    public reason: string,
    public extendedMessage: string = "",
  ) {
    super(reason);
  }

  override toString(): string {
    const header =
      "The execution of the program was halted because an illegal operation was attempted:";
    return `${header} ${this.reason}${
      this.extendedMessage ? " " : ""
    }${this.extendedMessage}`;
  }
}
