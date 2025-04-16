import {
  alt_sc,
  apply,
  kright,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
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
  kouter,
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { concatLines } from "../util/string.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST NODES */

export class VariableAssignmentAstNode implements InterpretableAstNode {
  assignee!: Token<TokenKind>;
  typeAnnotation!: Option<Token<TokenKind>>;
  value!: EvaluableAstNode;

  constructor(params: WithOptionalAttributes<VariableAssignmentAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(): AnalysisFindings {
    const findings = this.value.analyze();
    const ident = this.assignee.text;
    const existingSymbol = analysisTable.findSymbol(ident);
    const isInitialAssignment = !existingSymbol.hasValue();
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
      const expressionType = this.value.resolveType();
      this.typeAnnotation.then((annotationName) => {
        const resolvedAnnotation = typeTable.findType(annotationName.text)
          .map(([type, _flags]) => type)
          .unwrap();
        if (!resolvedAnnotation.typeCompatibleWith(expressionType)) {
          findings.errors.push(AnalysisError({
            message:
              "The type that was explicitly annotated in the assignment is not compatible with the type of the assigned value.",
            beginHighlight: DummyAstNode.fromToken(annotationName),
            endHighlight: None(),
            messageHighlight:
              `Type '${resolvedAnnotation.displayName()}' is incompatible with the type '${expressionType.displayName()}' on the right side of the assignment.`,
          }));
        }
      });
    } else {
      const readonly = existingSymbol
        .map(([_symbol, flags]) => flags.readonly)
        .unwrapOr(false);
      if (readonly) {
        findings.errors.push(
          AnalysisError({
            message:
              "This variable cannot be reassigned because it is part of the language.",
            beginHighlight: this,
            endHighlight: None(),
            messageHighlight: "",
          }),
        );
        return findings;
      }
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
      const expressionType = this.value.resolveType();
      analysisTable.findSymbol(ident)
        .then(([existing, _flags]) => {
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
      const expressionType = this.value.resolveType();
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
    const ident = this.assignee.text;
    runtimeTable.setSymbol(
      ident,
      new RuntimeSymbol({
        node: this.value,
        value: this.value.evaluate(),
      }),
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.assignee, this.value.tokenRange()[1]];
  }
}

export class PropertyWriteAstNode implements InterpretableAstNode {
  assignee!: EvaluableAstNode;
  typeAnnotation!: Option<Token<TokenKind>>;
  value!: EvaluableAstNode;

  constructor(params: WithOptionalAttributes<PropertyWriteAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(): AnalysisFindings {
    const findings = AnalysisFindings.merge(
      this.assignee.analyze(),
      this.value.analyze(),
    );
    this.typeAnnotation.then((annotation) => {
      findings.errors.push(AnalysisError({
        message: "Type annotations are not allowed on property writes.",
        beginHighlight: DummyAstNode.fromToken(annotation),
        endHighlight: None(),
        messageHighlight: "",
      }));
    });
    if (findings.isErroneous()) {
      return findings;
    }
    const valueType = this.value.resolveType();
    const assigneeType = this.assignee.resolveType();
    if (!valueType.typeCompatibleWith(assigneeType)) {
      findings.errors.push(AnalysisError({
        message:
          "The type of the value you are trying to assign is incompatible with the type of the field.",
        beginHighlight: this.assignee,
        endHighlight: Some(this.value),
        messageHighlight:
          `Type '${valueType.displayName()}' is incompatible with the type '${assigneeType.displayName()}'.`,
      }));
    }
    return findings;
  }

  interpret(): void {
    const currentValue = this.assignee.evaluate();
    const newValue = this.value.evaluate();
    currentValue.write(newValue.value);
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.assignee.tokenRange()[0], this.value.tokenRange()[1]];
  }
}

export type AssignmentAstNode =
  | VariableAssignmentAstNode
  | PropertyWriteAstNode;

/* PARSER */

const typeAnnotation = kright(
  ends_with_breaking_whitespace(str<TokenKind>(":")),
  tok(TokenKind.ident),
);

const rhs = kouter(
  opt_sc(typeAnnotation),
  surround_with_breaking_whitespace(
    ends_with_breaking_whitespace(str("=")),
  ),
  expression,
);

const variableAssignment = apply(
  seq(
    tok(TokenKind.ident),
    starts_with_breaking_whitespace(rhs),
  ),
  ([assignee, [typeAnnotation, value]]) =>
    new VariableAssignmentAstNode({
      assignee,
      typeAnnotation,
      value,
    }),
);

const propertyWrite = apply(
  seq(
    symbolExpression,
    starts_with_breaking_whitespace(rhs),
  ),
  ([assignee, [typeAnnotation, value]]) =>
    new PropertyWriteAstNode({
      assignee,
      typeAnnotation,
      value,
    }),
);

export const assignment = alt_sc(
  variableAssignment,
  propertyWrite,
);
