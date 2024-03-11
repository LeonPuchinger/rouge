import { TokenPosition } from "typescript-parsec";
import { AstNode, TokenAstNode } from "../ast.ts";
import { TokenType } from "../lexer.ts";
import { InternalError } from "./error.ts";
import { Option } from "./monad/index.ts";
import { indentLines, prefixIndentLines, toMultiline } from "./string.ts";

/**
 * Create a marker that highlights a section of code in a snippet.
 * The marker is points towards the specified section and includes a message.
 *
 * @param message the message do display beneath the marker.
 * @param firstPosition the token where the marker should start.
 * @param nextPosition the token where the marker should end. if `None`, the marker ends at the end of `firstPosition`.
 * @param offset amount of columns to move the marker to the right.
 */
function createAnnotationMarker(
  message: Option<string>,
  firstPosition: TokenPosition,
  nextPosition: Option<TokenPosition>,
  offset = 0,
): string {
  if (message.kind === "none") {
    return "";
  }
  const indentSize = firstPosition.columnBegin - 1;
  const markerEnd = nextPosition.unwrapOr(firstPosition).columnEnd - 1;
  const markerSize = markerEnd - indentSize;
  return toMultiline(
    `${" ".repeat(indentSize + offset)}${"~".repeat(markerSize)}`,
    message.unwrap(),
  );
}

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
  message: Option<string>,
): string {
  const lines = source.split("\n");
  const coreBegin = firstPosition.rowBegin - 1;
  let snippetBegin = coreBegin - linesPadding;
  if (snippetBegin < 0) {
    snippetBegin = 0;
  }
  const coreEnd = nextPosition.unwrapOr(firstPosition).rowEnd - 1;
  let snippetEnd = coreEnd + linesPadding;
  if (snippetEnd > lines.length) {
    snippetEnd = lines.length;
  }
  const indentSeparator = "|";
  const indentWidth = 4;
  return toMultiline(
    ...prefixIndentLines(
      lines.slice(snippetBegin, coreEnd + 1),
      indentSeparator,
      indentWidth,
    ),
    ...indentLines([
      createAnnotationMarker(message, firstPosition, nextPosition, 1),
    ], indentWidth),
    ...prefixIndentLines(
      lines.slice(coreEnd + 1, snippetEnd + 1),
      indentSeparator,
      indentWidth,
    ),
  );
}

function peelToTokenNode(
  node: AstNode,
  direction: "left" | "right",
): TokenAstNode<TokenType> {
  if ("child" in node) {
    return peelToTokenNode(node.child, direction);
  }
  if ("lhs" in node && direction === "left") {
    return peelToTokenNode(node.lhs, direction);
  }
  if ("rhs" in node && direction === "right") {
    return peelToTokenNode(node.rhs, direction);
  }
  if ("children" in node && node.children.length > 0) {
    if (direction === "left") {
      return peelToTokenNode(node.children[0], direction);
    }
    return peelToTokenNode(node.children[node.children.length - 1], direction);
  }
  if ("token" in node) {
    return node;
  }
  throw new InternalError(
    "Failed to peel an AST node to a TokenAstNode.",
    `No TokenAstNode could be found while peeling in the ${direction} direction.`,
  );
}

export const peelToLeftmostTokenNode = (node: AstNode) =>
  peelToTokenNode(node, "left");

export const peelToRightmostTokenNode = (node: AstNode) =>
  peelToTokenNode(node, "right");
