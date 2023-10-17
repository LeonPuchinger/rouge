export function Panic(reason: string): Error {
  return new Error(`PANIC: ${reason}.`);
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

function toMultiline(lines: string[]): string {
  return lines.join("\n");
}

export function InternalError(
  message: string,
): AppError {
  return {
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline([
        `INTERNAL ERROR: ${message}`,
        `${toMultiline(this.stacktrace)}`,
      ]);
    },
  };
}
