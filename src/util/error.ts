import { UncheckedAstNode } from "../ast.ts";
import { accessEnvironment } from "./environment.ts";
import { Option } from "./monad/index.ts";
import { createSnippet } from "./snippet.ts";
import { toMultiline } from "./string.ts";

export function Panic(reason: string): Error {
  return new Error(`PANIC: ${reason}.`);
}

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
    throw Panic(`assertion failed: ${message}`);
  }
}

export interface LocatableError {
  stacktrace: string[];
}

export interface PrintableError {
  toString: () => string;
}

export type AppError = LocatableError & PrintableError;

function captureStackTrace(subtractFrames = 0): string[] {
  const stackTrace = new Error().stack?.split("\n")
    .slice(subtractFrames + 2)
    .map((line) => line.trim());
  if (stackTrace) {
    return stackTrace;
  } else {
    return [];
  }
}

/**
 * A type of error that is the result of internal behavior
 * of the implementation of the language, not the user's input.
 *
 * @param message Header text to display at the top of the error message.
 */
export function InternalError(
  message: string,
  extendedMessage = "",
): AppError {
  if (extendedMessage !== "") {
    extendedMessage = `\n${extendedMessage}`;
  }
  return {
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline(
        `INTERNAL ERROR: ${message}${extendedMessage}`,
        `${toMultiline(...this.stacktrace)}`,
      );
    },
  };
}

/**
 * A type of error that is the result of the users input.
 * The message contains a snippet of the affected input as well as
 * a header message and an optional message attached to the affected area.
 * The snippet contains three lines of padding around the highlighted snippet.
 *
 * @param message Header text to display at the top of the error message.
 * @param beginHighlight The AST node where the snippet begins.
 * @param endHighlight The AST node where the snippet should end. The end of the line if None.
 * @param messageHighlight A message to attach to the highlighted section of code.
 */
export function InterpreterError(
  message: string,
  beginHighlight: UncheckedAstNode,
  endHighlight: Option<UncheckedAstNode>,
  messageHighlight: Option<string>,
): AppError {
  return {
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline(
        message,
        createSnippet(
          accessEnvironment("source"),
          beginHighlight.token.unwrap().pos,
          endHighlight.map((node) => node.token.unwrap().pos),
          3,
          messageHighlight,
        ),
      );
    },
  };
}
