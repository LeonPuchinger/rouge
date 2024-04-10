import { AstNode } from "./ast.ts";
import { accessEnvironment } from "./util/environment.ts";
import { Option, Some } from "./util/monad/index.ts";
import { createSnippet } from "./util/snippet.ts";
import { toMultiline } from "./util/string.ts";
import { Attributes } from "./util/type.ts";

type AnalysisFindingKind = "error" | "warning";

/**
 * Represents an issue with the users source code input.
 */
export interface AnalysisFinding {
  /**
   * A formal description of the issue and why it came to be.
   */
  message: string;

  /**
   * An optional message that can provide further details on the issue.
   */
  additionalMessage: Option<string>;

  /**
   * Whether or not the interpretation can continue with this issue or not.
   */
  kind: AnalysisFindingKind;

  /**
   * Converts the finding to a string representation that is supposed to be shown to the user.
   */
  toString(): string;
}

interface AnalysisFindingParams {
  /**
   * Header text to display at the top of the error message.
   */
  message: string;

  /**
   * The AST node where the snippet begins.
   */
  beginHighlight: AstNode;

  /**
   * The AST node where the snippet should end. The end of the line if None.
   */
  endHighlight: Option<AstNode>;

  /**
   * A message to attach to the highlighted section of code.
   */
  messageHighlight?: string;
}

/**
 * Creates a finding which can be formatted to show to the user.
 * The message contains a snippet of the affected input as well as
 * a header message and an optional message attached to the affected area.
 * The snippet contains three lines of padding around the highlighted snippet.
 *
 * @param kind Whether or not the interpretation can continue with this issue or not.
 */
function createAnalysisFinding(
  params: AnalysisFindingParams,
  kind: AnalysisFindingKind,
): AnalysisFinding {
  return {
    message: params.message,
    additionalMessage: Some(params.messageHighlight),
    kind: kind,
    toString() {
      return toMultiline(
        `${kind.toUpperCase()}: ${params.message}`,
        createSnippet(
          accessEnvironment("source"),
          params.beginHighlight.tokenRange()[0].pos,
          params.endHighlight.map((node) => node.tokenRange()[1].pos),
          3,
          Some(params.messageHighlight),
        ),
      );
    },
  };
}

/**
 * A finding which prevents the interpretation from continuing.
 */
export const AnalysisError = (params: AnalysisFindingParams) =>
  createAnalysisFinding(params, "error");

/**
 * A finding which should be addressed, but allows the interpretation to continue.
 */
export const AnalysisWarning = (params: AnalysisFindingParams) =>
  createAnalysisFinding(params, "warning");

/**
 * A type that bundles warning and error findings together.
 */
export class AnalysisFindings {
  warnings!: AnalysisFinding[];
  errors!: AnalysisFinding[];

  constructor(params: Attributes<AnalysisFindings>) {
    Object.assign(this, params);
  }

  static empty(): AnalysisFindings {
    return new AnalysisFindings({
      warnings: [],
      errors: [],
    });
  }

  /**
   * Create a new instance that contains the warnings and errors from multiple other instances.
   */
  static merge(...findings: AnalysisFindings[]): AnalysisFindings {
    return findings.reduce(
      (previous, current) =>
        new AnalysisFindings({
          errors: [...previous.errors, ...current.errors],
          warnings: [...previous.errors, ...current.errors],
        }),
      new AnalysisFindings({ errors: [], warnings: [] }),
    );
  }

  isErroneous() {
    return this.errors.length >= 1;
  }
}
