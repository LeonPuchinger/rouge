import { apply, seq, str, tok, Token } from "typescript-parsec";
import {
  ExpressionAstNode,
  InterpretableAstNode,
  TokenAstNode,
  WrapperAstNode,
} from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { expression } from "../parser.ts";
import {
  analysisTable,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
} from "../symbol.ts";
import { None } from "../util/monad/index.ts";
import { concatLines } from "../util/string.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

// TODO: rename, don't abbreviate!
export class AssignmentAstNode
  implements
    TokenAstNode,
    WrapperAstNode<ExpressionAstNode>,
    InterpretableAstNode {
  token!: Token<TokenKind>;
  child!: ExpressionAstNode;

  constructor(params: Attributes<AssignmentAstNode>) {
    Object.assign(this, params);
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
  check(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const ident = this.token.text;
    AnalysisFindings.merge(findings, this.child.analyze());
    if (findings.isErroneous()) {
      return findings;
    }
    const expressionType = this.child.resolveType();
    analysisTable.findSymbol(ident)
      .then((existing) => {
        if (existing.valueKind === expressionType) {
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
            valueKind: expressionType,
          }),
        );
      });
    return findings;
  }
}

/* PARSER */

// TODO: use `kouter`
export const assignment = apply(
  seq(
    tok(TokenKind.ident),
    str("="),
    expression,
  ),
  (values) =>
    new AssignmentAstNode({
      token: values[0],
      child: values[2],
    }),
);
