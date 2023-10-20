import { TokenPosition } from "typescript-parsec";
import { Option } from "./monad/index.ts";
import { toMultiline } from "./string.ts";

/**
 * Create an annotated snippet of code for a specified range of an input string.
 * The snippet consists of a core section which can stretch over multiple lines.
 * The core section can be annotated with a message.
 * The snippet also includes linenumbers. (TODO)
 *
 * @param source the input text into the compiler. needs to be the same text as the input to the parser.
 * @param firstPosition defines the beginning of the core section. if no other position is specified, it also defines the end of the core section.
 * @param nextPosition defines the end of the core section.
 * @param linesPadding the amount of lines to show in the snippet surrounding the snippet in both directions.
 * @param message a message shown below the core section of the snippet.
 */
export function createSnippet(
  source: string,
  firstPosition: TokenPosition,
  nextPosition: Option<TokenPosition>,
  linesPadding: number,
  message: string,
): string {
  const lines = source.split("\n");
  const coreBegin = firstPosition.rowBegin;
  let snippetBegin = coreBegin - linesPadding;
  if (snippetBegin < 0) {
    snippetBegin = 0;
  }
  const coreEnd = nextPosition.unwrapOr(firstPosition).rowEnd;
  let snippetEnd = coreEnd + linesPadding;
  if (snippetEnd > lines.length) {
    snippetEnd = lines.length;
  }
  return toMultiline(
    lines.slice(snippetBegin, coreEnd + 1).join("\n"),
    `${message}`,
    lines.slice(coreEnd + 1, snippetEnd + 1).join("\n"),
  );
}
