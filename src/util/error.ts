import { AstNode } from "../ast.ts";
import { Option } from "./monad/index.ts";
import { createSnippet } from "./snippet.ts";
import { toMultiline } from "./string.ts";

export function Panic(reason: string): Error {
  return new Error(`PANIC: ${reason}.`);
}

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

export function InternalError(
  message: string,
): AppError {
  return {
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline(
        `INTERNAL ERROR: ${message}`,
        `${toMultiline(...this.stacktrace)}`,
      );
    },
  };
}

export function InterpreterError(
  message: string,
  beginHighlight: AstNode,
  endHighlight: Option<AstNode>,
  messageHighlight: Option<string>,
): AppError {
  return {
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline(
        message,
        createSnippet(
          "", // TODO: somehow get a hold of the source
          beginHighlight.token.unwrap().pos,
          endHighlight.map(node => node.token.unwrap().pos),
          3,
          messageHighlight,
        ),
      )
    },
  };
}
