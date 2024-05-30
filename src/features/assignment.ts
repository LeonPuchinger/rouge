import { apply, str, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
} from "../symbol.ts";
import { None } from "../util/monad/index.ts";
import { kouter, surround_with_breaking_whitespace } from "../util/parser.ts";
import { concatLines } from "../util/string.ts";
import { Attributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";

/* AST NODES */

export class AssignmentAstNode implements InterpretableAstNode {
  token!: Token<TokenKind>;
  child!: ExpressionAstNode;

  constructor(params: Attributes<AssignmentAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    const findings = this.child.analyze();
    if (findings.isErroneous()) {
      return findings;
    }
    const ident = this.token.text;
    const expressionType = this.child.resolveType();
    analysisTable.findSymbol(ident)
      .then((existing) => {
        if (existing.valueType.typeCompatibleWith(expressionType)) {
          return;
        }
        findings.errors.push(
          AnalysisError({
            message: concatLines(
              `You tried setting the variable '${ident}' to a value that is incompatible with the variables type.`,
              "When a variable is created its type is set in stone.",
              "This means, that afterwards the variable can only be set to values with the same type.",
              "A variable is created the first time a value is assigned to it.",
            ),
            beginHighlight: this,
            endHighlight: None(),
          }),
        );
      })
      .onNone(() => {
        analysisTable.setSymbol(
          ident,
          new StaticSymbol({
            valueType: expressionType,
          }),
        );
      });
    return findings;
  }

  interpret(): void {
    const ident = this.token.text;
    runtimeTable.setSymbol(
      ident,
      new RuntimeSymbol({
        node: this.child,
        value: this.child.evaluate(),
      }),
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.token, this.child.tokenRange()[1]];
  }
}

/* PARSER */

export const assignment = apply(
  kouter(
    tok(TokenKind.ident),
    surround_with_breaking_whitespace(str("=")),
    expression,
  ),
  ([token, expression]) =>
    new AssignmentAstNode({
      token: token,
      child: expression,
    }),
);
