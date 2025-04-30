import {
  alt_sc,
  apply,
  kright,
  opt_sc,
  Parser,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
} from "../symbol.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  kouter,
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { concatLines } from "../util/string.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { symbolExpression } from "./symbol_expression.ts";
import { typeLiteral, TypeLiteralAstNode } from "./type_literal.ts";

/* AST NODES */

export class VariableAssignmentAstNode implements InterpretableAstNode {
  assignee!: Token<TokenKind>;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  value!: EvaluableAstNode;

  constructor(params: WithOptionalAttributes<VariableAssignmentAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = this.value.analyze(environment);
    const ident = this.assignee.text;
    const existingSymbol = analysisTable.findSymbol(ident);
    const isInitialAssignment = !existingSymbol.hasValue();
    const expressionFindingsErroneous = findings.isErroneous();
    if (isInitialAssignment) {
      const typeAnnotationFindings = this.typeAnnotation
        .map((annotation) => annotation.analyze(environment))
        .unwrapOr(AnalysisFindings.empty());
      findings = AnalysisFindings.merge(
        findings,
        typeAnnotationFindings,
      );
      if (findings.isErroneous()) {
        return findings;
      }
      const expressionType = this.value.resolveType(environment);
      this.typeAnnotation
        .map((annotation) => annotation.resolveType(environment))
        .then((annotation) => {
          if (!annotation.typeCompatibleWith(expressionType)) {
            findings.errors.push(AnalysisError(environment, {
              message:
                "The type of the assigned value is not compatible with the type that was explicitly annotated in the assignment.",
              beginHighlight: this.value,
              endHighlight: None(),
              messageHighlight:
                `Type '${expressionType.displayName()}' is incompatible with the type '${annotation.displayName()}'.`,
            }));
          }
        });
    } else {
      const readonly = existingSymbol
        .map(([_symbol, flags]) => flags.readonly)
        .unwrapOr(false);
      if (readonly) {
        findings.errors.push(
          AnalysisError(environment, {
            message:
              "This variable cannot be reassigned because it is part of the language.",
            beginHighlight: this,
            endHighlight: None(),
            messageHighlight: "",
          }),
        );
        return findings;
      }
      this.typeAnnotation.then((annotation) => {
        findings.errors.push(AnalysisError(environment, {
          message:
            "Type annotations on assignments are only allowed when the variable is first created.",
          beginHighlight: annotation,
          endHighlight: None(),
        }));
      });
      if (expressionFindingsErroneous) {
        return findings;
      }
      const expressionType = this.value.resolveType(environment);
      analysisTable.findSymbol(ident)
        .then(([existing, _flags]) => {
          if (existing.valueType.typeCompatibleWith(expressionType)) {
            return;
          }
          findings.errors.push(
            AnalysisError(environment, {
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
      const expressionType = this.typeAnnotation
        .map((annotation) => annotation.resolveType(environment))
        .unwrapOr(this.value.resolveType(environment));
      analysisTable.setSymbol(
        ident,
        new StaticSymbol({
          valueType: expressionType,
        }),
      );
    }
    return findings;
  }

  interpret(environment: ExecutionEnvironment): void {
    const ident = this.assignee.text;
    const type = this.typeAnnotation
      .map((annotation) => annotation.resolveType(environment))
      .unwrapOr(this.value.resolveType(environment));
    const value = this.value.evaluate(environment);
    value.valueType = type;
    runtimeTable.setSymbol(
      ident,
      new RuntimeSymbol({
        node: this.value,
        value: value,
      }),
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.assignee, this.value.tokenRange()[1]];
  }
}

export class PropertyWriteAstNode implements InterpretableAstNode {
  assignee!: EvaluableAstNode;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  value!: EvaluableAstNode;

  constructor(params: WithOptionalAttributes<PropertyWriteAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = AnalysisFindings.merge(
      this.assignee.analyze(environment),
      this.value.analyze(environment),
    );
    this.typeAnnotation.then((annotation) => {
      findings.errors.push(AnalysisError(environment, {
        message: "Type annotations are not allowed on property writes.",
        beginHighlight: annotation,
        endHighlight: None(),
        messageHighlight: "",
      }));
    });
    if (findings.isErroneous()) {
      return findings;
    }
    const valueType = this.value.resolveType(environment);
    const assigneeType = this.assignee.resolveType(environment);
    if (!valueType.typeCompatibleWith(assigneeType)) {
      findings.errors.push(AnalysisError(environment, {
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

  interpret(environment: ExecutionEnvironment): void {
    const currentValue = this.assignee.evaluate(environment);
    const newValue = this.value.evaluate(environment);
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
  typeLiteral,
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

export const assignment: Parser<TokenKind, AssignmentAstNode> = alt_sc(
  variableAssignment,
  propertyWrite,
);
