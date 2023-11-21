export function toMultiline(...lines: string[]): string {
  return lines.join("\n");
}

export function concatLines(...lines: string[]): string {
  return lines.join(" ");
}
