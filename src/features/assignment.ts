import { apply, kright, opt_sc, seq, str, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
} from "../symbol.ts";
import { typeTable } from "../type.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { concatLines } from "../util/string.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";

/* AST NODES */

export class AssignmentAstNode implements InterpretableAstNode {
  token!: Token<TokenKind>;
  typeAnnotation!: Option<Token<TokenKind>>;
  child!: ExpressionAstNode;

  constructor(params: WithOptionalAttributes<AssignmentAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(): AnalysisFindings {
    const findings = this.child.analyze();
    const ident = this.token.text;
    const isInitialAssignment = !analysisTable.findSymbol(ident).hasValue();
    const expressionFindingsErroneous = findings.isErroneous();
    if (isInitialAssignment) {
      this.typeAnnotation.then((annotationName) => {
        if (!typeTable.typeResolvable(annotationName.text)) {
          findings.errors.push(AnalysisError({
            message:
              "The type that was explicitly annotated in the assignment could not be found.",
            beginHighlight: DummyAstNode.fromToken(annotationName),
            endHighlight: None(),
            messageHighlight:
              `Type "${annotationName.text}" could not be found.`,
          }));
        }
      });
      if (findings.isErroneous()) {
        return findings;
      }
      const expressionType = this.child.resolveType();
      this.typeAnnotation.then((annotationName) => {
        const resolvedAnnotation = typeTable.findType(annotationName.text)
          .unwrap();
        if (!resolvedAnnotation.typeCompatibleWith(expressionType)) {
          findings.errors.push(AnalysisError({
            message:
              "The type that was explicitly annotated in the assignment is not compatible with the type of the assigned value.",
            beginHighlight: DummyAstNode.fromToken(annotationName),
            endHighlight: None(),
            // TODO: allow resolving the names of SymbolTypes (e.g. for this error message)
            messageHighlight:
              `Type "${annotationName.text}" is incompatible with the type of the value on the right side of the assignment.`,
          }));
        }
      });
    } else {
      this.typeAnnotation.then((annotationName) => {
        findings.errors.push(AnalysisError({
          message:
            "Type annotations on assignments are only allowed when the variable is first created.",
          beginHighlight: DummyAstNode.fromToken(annotationName),
          endHighlight: None(),
        }));
      });
      if (expressionFindingsErroneous) {
        return findings;
      }
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
        });
    }
    if (!findings.isErroneous()) {
      const expressionType = this.child.resolveType();
      analysisTable.setSymbol(
        ident,
        new StaticSymbol({
          valueType: expressionType,
        }),
      );
    }
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

const typeAnnotation = kright(
  ends_with_breaking_whitespace(str<TokenKind>(":")),
  tok(TokenKind.ident),
);

export const assignment = apply(
  seq(
    tok(TokenKind.ident),
    surround_with_breaking_whitespace(opt_sc(typeAnnotation)),
    ends_with_breaking_whitespace(str("=")),
    expression,
  ),
  ([name, typeAnnotation, _, expression]) =>
    new AssignmentAstNode({
      token: name,
      typeAnnotation: typeAnnotation,
      child: expression,
    }),
);
