import { Token, TokenPosition } from "typescript-parsec";
import { AstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "./error.ts";
import { Option } from "./monad/index.ts";
import { indentLines, prefixIndentLines, toMultiline } from "./string.ts";
import { Attributes } from "./type.ts";

/**
 * Create a marker that highlights a section of code in a snippet.
 * The marker points towards the specified section and includes a message.
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
  if (markerSize < 0) {
    throw new InternalError(
      "The marker size could not be determined.",
      "This is likely due to the fact that the first and next positions have been passed in the wrong order.",
    );
  }
  return toMultiline(
    `${" ".repeat(indentSize + offset)}${"~".repeat(markerSize)}`,
    message.unwrap(),
  );
}

function tokenPositionBefore(a: TokenPosition, b: TokenPosition): boolean {
  if (a.rowBegin === b.rowBegin) {
    return a.columnBegin <= b.columnBegin;
  }
  return a.rowBegin <= b.rowBegin;
}

/**
 * Create an annotated snippet of code for a specified range of an input string.
 * The snippet consists of a required section which is guaranteed to always be included in the snippet in full.
 * The required section is surrounded by a specified amount of lines in padding.
 * Within the required section, another section can be highlighted by attaching a message to it.
 * Sections can stretch over multiple lines.
 * The snippet also includes linenumbers. (TODO)
 * The input string needs to correspond to the string that was used to generate the `TokenPositions`s used.
 *
 * @param source The input text into the interpreter. needs to be the same text as the input to the parser.
 * @param requiredFrom Defines the beginning of the required section.
 * @param requiredTo Defines the end of the required section. If not specified, the required section will only measure one token.
 * @param highlightFrom Defines the beginning of the highlighted section.
 * @param highlightTo Defines the end of the highlighted section
 * @param linesPadding The amount of lines to show in the snippet surrounding the snippet in both directions.
 * @param highlightMessage A message shown below the highlighted section of the snippet.
 */
export function createSnippet(
  source: string,
  requiredFrom: TokenPosition,
  requiredTo: Option<TokenPosition>,
  highlightFrom: Option<TokenPosition>,
  highlightTo: Option<TokenPosition>,
  linesPadding: number,
  highlightMessage: Option<string>,
): string {
  if (highlightFrom.kind === "none" && highlightTo.kind === "some") {
    throw new InternalError(
      "Only an AST node to end a highlighted segment in a snippet was passed, however, none to start it.",
    );
  }
  highlightTo = highlightTo.or(highlightFrom);
  const highlightPositions = highlightFrom.zip(highlightTo);
  const highlightDesired = highlightPositions.map((_) => true).unwrapOr(false);
  const highlightWithinSnippet = highlightPositions
    .map(([from, to]) =>
      tokenPositionBefore(requiredFrom, from) &&
      tokenPositionBefore(to, requiredTo.unwrapOr(requiredFrom))
    )
    .unwrapOr(false);
  const lines = source.split("\n");
  const requiredFromLine = requiredFrom.rowBegin - 1;
  let snippetFromLine = requiredFromLine - linesPadding;
  if (snippetFromLine < 0) {
    snippetFromLine = 0;
  }
  const requiredToLine = requiredTo.unwrapOr(requiredFrom).rowEnd - 1;
  let snippetToLine = requiredToLine + linesPadding;
  if (snippetToLine > lines.length) {
    snippetToLine = lines.length;
  }
  let highlightFromLine = requiredFromLine;
  let highlightToLine = highlightFromLine + 1;
  let highlightMarker = "";
  if (highlightDesired) {
    if (!highlightWithinSnippet) {
      throw new InternalError(
        "The highlighted portion of a snippet was not within the bounds of the section that is required to be included.",
      );
    }
    highlightFromLine = highlightFrom.unwrap().rowBegin - 1;
    highlightToLine = highlightTo.unwrap().rowEnd - 1;
    highlightMarker = createAnnotationMarker(
      highlightMessage,
      highlightFrom.unwrap(),
      highlightTo,
      1,
    );
  }
  if (!highlightDesired) {
    highlightFromLine += 1;
  }
  // generate snippet
  const indentSeparator = "|";
  const indentWidth = 4;
  return toMultiline(
    ...prefixIndentLines(
      lines.slice(snippetFromLine, highlightFromLine + 1),
      indentSeparator,
      indentWidth,
    ),
    ...indentLines([
      ...(highlightMarker !== "" ? [highlightMarker] : []),
    ], indentWidth),
    ...prefixIndentLines(
      lines.slice(highlightToLine + 1, snippetToLine + 1),
      indentSeparator,
      indentWidth,
    ),
  );
}

/**
 * An AST node that has never been emitted by the parser.
 * This AST node is supposed to be created on the spot when an AST node is required
 * but there is only access to a `Token` or `TokenPosition`.
 * Usually this is the case when a snippet needs to be created from a `Token`.
 * To create an instance of `DummyAstNode`, use the factory methods `fromToken` or `fromTokenPosition`.
 */
export class DummyAstNode implements AstNode {
  tokenFrom!: Token<TokenKind>;
  tokenTo!: Token<TokenKind>;

  /**
   * @param tokenFrom Used as the beginning of the token range.
   * @param tokenTo Used as the end of the token range.
   */
  constructor(params: Attributes<DummyAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return AnalysisFindings.empty();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.tokenFrom, this.tokenTo];
  }

  /**
   * Creates a `DummyAstNode` from a single `Token`.
   * The `Token` is used as both the start as well as the end of the token range.
   */
  static fromToken(token: Token<TokenKind>): AstNode {
    return new DummyAstNode({
      tokenFrom: token,
      tokenTo: token,
    });
  }

  /**
   * Creates a `DummyAstNode` from a `TokenPosition`.
   * Compared to `fromToken`, this factory method needs to create a dummy `Token` as well.
   * The dummy `Token` represents a token stream with only a single `Token`.
   * The `TokenType` is set to `undefined`.
   * The dummy `Token` is used as both the start as well as the end of the token range.
   */
  static fromTokenPosition(
    environment: ExecutionEnvironment,
    position: TokenPosition,
  ): AstNode {
    const dummyToken = {
      kind: TokenKind.unspecified,
      text: environment.source,
      pos: position,
      next: undefined,
    };
    return DummyAstNode.fromToken(dummyToken);
  }
}
