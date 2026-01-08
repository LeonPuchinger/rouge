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
  CompositeSymbolValue,
  RuntimeSymbol,
  StaticSymbol,
} from "../symbol.ts";
import { CompositeSymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  lrec_at_least_once_sc,
  starts_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { concatLines } from "../util/string.ts";
import { WithOptionalAttributes } from "../util/type.ts";
import { expression } from "./expression.ts";
import { referenceExpression } from "./parser_declarations.ts";
import { PropertyAccessAstNode } from "./symbol_expression.ts";
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
    const ident = this.assignee.text;
    let findings = this.value.analyze(environment, { assignmentTarget: ident });
    const existingSymbol = environment.analysisTable.findSymbol(ident);
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
          if (!expressionType.typeCompatibleWith(annotation)) {
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
      environment.analysisTable.findSymbol(ident)
        .then(([existing, _flags]) => {
          if (expressionType.typeCompatibleWith(existing.valueType)) {
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
      environment.analysisTable.setSymbol(
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
    environment.runtimeTable.setSymbol(
      ident,
      new RuntimeSymbol({
        node: this.value,
        value: value,
      }),
    );
  }

  get_representation(environment: ExecutionEnvironment): string {
    this.interpret(environment);
    return "Nothing";
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.assignee, this.value.tokenRange()[1]];
  }
}

export class PropertyWriteAstNode implements InterpretableAstNode {
  parent!: EvaluableAstNode;
  child!: Token<TokenKind>;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  value!: EvaluableAstNode;

  constructor(params: WithOptionalAttributes<PropertyWriteAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = AnalysisFindings.merge(
      this.parent.analyze(environment),
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
    const parentType = this.parent.resolveType(environment);
    const fieldExists = parentType instanceof CompositeSymbolType &&
      parentType.fields.has(this.child.text);
    if (!fieldExists) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "The property you are trying to write to does not exist on the object.",
        beginHighlight: DummyAstNode.fromToken(this.child),
        endHighlight: None(),
        messageHighlight:
          `Type "${parentType.displayName()}" does not include an attibute called "${this.child.text}".`,
      }));
      return findings;
    }
    const targetType = (parentType as CompositeSymbolType).fields.get(
      this.child.text,
    )!;
    const valueType = this.value.resolveType(environment);
    if (!valueType.typeCompatibleWith(targetType)) {
      findings.errors.push(AnalysisError(environment, {
        message:
          "The type of the value you are trying to assign is incompatible with the type of the field.",
        beginHighlight: DummyAstNode.fromToken(this.child),
        endHighlight: Some(this.value),
        messageHighlight:
          `Type '${valueType.displayName()}' is incompatible with the type '${targetType.displayName()}'.`,
      }));
    }
    return findings;
  }

  interpret(environment: ExecutionEnvironment): void {
    const parentValue = this.parent.evaluate(environment);
    const newValue = this.value.evaluate(environment);
    if (!(parentValue instanceof CompositeSymbolValue)) {
      throw new InternalError(
        "The parent value of a property write must be a `CompositeSymbolValue`.",
        "This should have been caught during static analysis.",
      );
    }
    parentValue.value.set(this.child.text, newValue);
  }

  get_representation(environment: ExecutionEnvironment): string {
    this.interpret(environment);
    return "Nothing";
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.parent.tokenRange()[0], this.value.tokenRange()[1]];
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

const assignmentSource = kright(
  ends_with_breaking_whitespace(
    ends_with_breaking_whitespace(str("=")),
  ),
  expression,
);

const variableAssignment = apply(
  seq(
    tok(TokenKind.ident),
    opt_sc(starts_with_breaking_whitespace(typeAnnotation)),
    starts_with_breaking_whitespace(assignmentSource),
  ),
  ([assignee, typeAnnotation, value]) =>
    new VariableAssignmentAstNode({
      assignee,
      typeAnnotation,
      value,
    }),
);

const propertyAccess = kright(
  ends_with_breaking_whitespace(str<TokenKind>(".")),
  tok(TokenKind.ident),
);

const propertyWriteTarget = apply(
  lrec_at_least_once_sc<
    TokenKind,
    [EvaluableAstNode, Token<TokenKind> | undefined],
    [EvaluableAstNode, Token<TokenKind> | undefined],
    Token<TokenKind>
  >(
    apply(
      referenceExpression,
      (result) => [result, undefined],
    ),
    starts_with_breaking_whitespace(
      propertyAccess,
    ),
    ([previousParent, previousChild], child) => {
      if (previousChild === undefined) {
        return [previousParent, child];
      }
      return [
        new PropertyAccessAstNode({
          parent: previousParent,
          identifierToken: previousChild,
        }),
        child,
      ];
    },
  ),
  ([parent, child]) => {
    // `child` will never be `undefined` here because
    // the parser (`lrec_at_least_once`) requires at least one property access.
    // When there is at least one property access, the callback passed to `apply`
    // will absorb the `undefined` value of the first iteration.
    return [parent, child!] as [EvaluableAstNode, Token<TokenKind>];
  },
);

const propertyWrite = apply(
  seq(
    propertyWriteTarget,
    opt_sc(starts_with_breaking_whitespace(typeAnnotation)),
    starts_with_breaking_whitespace(assignmentSource),
  ),
  ([[parent, child], typeAnnotation, value]) =>
    new PropertyWriteAstNode({
      parent: parent,
      child: child,
      typeAnnotation,
      value,
    }),
);

export const assignment: Parser<TokenKind, AssignmentAstNode> = alt_sc(
  variableAssignment,
  propertyWrite,
);
