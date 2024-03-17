export function toMultiline(...lines: string[]): string {
  return lines.join("\n");
}

export function concatLines(...lines: string[]): string {
  return lines.join(" ").trim();
}

export function indentLines(lines: string[], width: number): string[] {
  return lines.map((line) => `${" ".repeat(width)}${line}`);
}

export function prefixLines(lines: string[], prefix: string): string[] {
  return lines.map((line) => `${prefix}${line}`);
}

export function prefixIndentLines(
  lines: string[],
  prefix: string,
  width: number,
): string[] {
  return prefixLines(indentLines(lines, width), prefix);
}
