import { alt_sc, apply, list_sc, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { InternalError } from "../util/error.ts";
import { Attributes } from "../util/type.ts";
import { assignment, AssignmentAstNode } from "./assignment.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
// required for extension methods to be usable
import {} from "../util/array.ts";
import { accessEnvironment } from "../util/environment.ts";
import { None } from "../util/monad/option.ts";
import { ConditionAstNode } from "./condition.ts";
import { ReturnStatementAstNode } from "./function.ts";
import { condition } from "./parser_declarations.ts";
import {
  StructureDefiniitonAstNode,
  structureDefinition,
} from "./structure.ts";

/* AST NODES */

export type StatementAstNode =
  | ExpressionAstNode
  | ConditionAstNode
  | StructureDefiniitonAstNode
  | AssignmentAstNode;

export class StatementsAstNode implements InterpretableAstNode {
  children!: StatementAstNode[];
  config = {
    representsFrame: false,
    representsGlobalScope: false,
  };

  constructor(params: Omit<Attributes<StatementsAstNode>, "config">) {
    Object.assign(this, params);
  }

  configure(updateConfig: Partial<typeof this.config>) {
    for (const [key, value] of Object.entries(updateConfig)) {
      if (value !== undefined) {
        Object.assign(this.config, { [key]: value });
      }
    }
  }

  interpret(): void {
    const flags = accessEnvironment("flags");
    for (const child of this.children) {
      if (flags.terminateCurrentFrame) {
        if (this.config.representsFrame) {
          flags.terminateCurrentFrame = false;
        }
        return;
      }
      child.interpret();
    }
  }

  analyze(): AnalysisFindings {
    const findings = this.children
      .map((statement) => statement.analyze())
      .reduce((previous, current) => AnalysisFindings.merge(previous, current));
    if (this.config.representsGlobalScope) {
      for (const child of this.children) {
        if (child instanceof ReturnStatementAstNode) {
          findings.errors.push(AnalysisError({
            message:
              "Return statements are only allowed inside of functions or methods",
            beginHighlight: child,
            endHighlight: None(),
          }));
        }
      }
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    if (this.children.length <= 0) {
      throw new InternalError(
        "Tried to request the token range for a StatementsAstNode which had no children.",
        "StatementsAstNodes have to have at least one child in order to generate a token range.",
      );
    }
    return [
      this.children[0].tokenRange()[0],
      this.children.last().tokenRange()[1],
    ];
  }
}

/* PARSERS */

const statement = alt_sc(
  assignment,
  condition,
  structureDefinition,
  expression,
);

export const statements = apply(
  list_sc(
    statement,
    tok(TokenKind.breakingWhitespace),
  ),
  (statements) => new StatementsAstNode({ children: statements }),
);
