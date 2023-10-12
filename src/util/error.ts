export function Panic(reason: string): Error {
  return new Error(`PANIC: ${reason}.`);
}

export interface LocatableError {
  file: string;
  lineno: number;
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

function getCallerFileName(subtractFrames = 0): string {
  const stackTrace = captureStackTrace(subtractFrames + 1);
  if (stackTrace.length > 0) {
    const callerLine = stackTrace[0];
    const fileNameMatch = callerLine.match(/\((.*):[0-9]+:[0-9]+\)/);
    if (fileNameMatch && fileNameMatch.length > 1) {
      return fileNameMatch[1];
    }
  }
  throw Panic(
    "Could not determine file name while trying to generate an error",
  );
}

function getCallerLineNumber(subtractFrames = 0): number {
  const stackTrace = captureStackTrace(subtractFrames + 1);
  if (stackTrace.length > 0) {
    const callerLine = stackTrace[0];
    const lineNumberMatch = callerLine.match(/\((.*):([0-9]+):[0-9]+\)/);
    if (lineNumberMatch && lineNumberMatch.length > 2) {
      return parseInt(lineNumberMatch[2]);
    }
  }
  throw Panic(
    "Could not determine line number while trying to generate an error",
  );
}

function toMultiline(lines: string[]): string {
  return lines.join("\n");
}

export function InternalError(
  message: string,
): AppError {
  return {
    file: getCallerFileName(1),
    lineno: getCallerLineNumber(1),
    stacktrace: captureStackTrace(1),
    toString() {
      return toMultiline([
        `INTERNAL ERROR: ${message}`,
        `at: ${this.file}:${this.lineno}`,
        `stacktrace:`,
        `${toMultiline(this.stacktrace)}`,
      ]);
    },
  };
}
