import {
  alt,
  apply,
  kleft,
  kmid,
  kright,
  list_sc,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";
import {
  CompositeSymbolType,
  IgnoreSymbolType,
  PlaceholderSymbolType,
  SymbolType,
  typeTable,
} from "../type.ts";
import { findDuplicates, removeAll } from "../util/array.ts";
import { InternalError } from "../util/error.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { typeLiteral, TypeLiteralAstNode } from "./type_literal.ts";

/* AST NODES */

class FieldAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  defaultValue!: Option<ExpressionAstNode>;

  constructor(params: WithOptionalAttributes<FieldAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
    this.defaultValue = Some(params.defaultValue);
  }

  resolveType(): SymbolType {
    return (this.typeAnnotation as Option<
      TypeLiteralAstNode | ExpressionAstNode
    >)
      .or(this.defaultValue)
      .map((node) => node.resolveType())
      .unwrapOrThrow(
        new InternalError(
          "A field for a structure has to have at least a type annotation or a default value.",
          "This should have been caught by static analysis.",
        ),
      );
  }

  /**
   * Creates a reference to an `IgnoreSymbolType` for the field.
   * When the type of the field can safely be determined, the reference
   * can be updated with the actual type. The reference is realized
   * using a `PlaceholderSymbolType`.
   */
  resolvePreliminaryType(): SymbolType {
    const reference = new PlaceholderSymbolType({
      name: this.name.text,
      rebindingAllowed: true,
    });
    reference.bind(new IgnoreSymbolType());
    return reference;
  }

  analyze(): AnalysisFindings {
    const typeAnnotationFindings = this.typeAnnotation
      .map((typeAnnotation) => typeAnnotation.analyze())
      .unwrapOr(AnalysisFindings.empty());
    const defaultValueFindings = this.defaultValue
      .map((defaultValue) => defaultValue.analyze())
      .unwrapOr(AnalysisFindings.empty());
    const findings = AnalysisFindings.merge(
      typeAnnotationFindings,
      defaultValueFindings,
    );
    if (findings.isErroneous()) {
      return findings;
    }
    if (this.typeAnnotation.hasValue() && this.defaultValue.hasValue()) {
      const typeAnnotation = this.typeAnnotation.unwrap();
      const expression = this.defaultValue.unwrap();
      const typeAnnotationType = typeAnnotation.resolveType();
      const expressionType = expression.resolveType();
      if (!expressionType.typeCompatibleWith(typeAnnotationType)) {
        findings.errors.push(AnalysisError({
          message:
            `The default value for field "${this.name.text}" is incompatible with its explicitly stated type.`,
          beginHighlight: typeAnnotation,
          endHighlight: this.defaultValue,
          messageHighlight:
            `The field is expected to be of type "${typeAnnotationType.displayName()}" but the default value is of type "${expressionType.displayName()}".`,
        }));
      }
    }
    if (!this.typeAnnotation.hasValue() && !this.defaultValue.hasValue()) {
      findings.errors.push(AnalysisError({
        message:
          `For each field, you have to at least specify its type or provide a default value.`,
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
        messageHighlight:
          `The type of the field "${this.name.text}" could not be determined.`,
      }));
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [
      this.name,
      this.defaultValue
        .map((value) => value.tokenRange()[1])
        .unwrapOr(
          this.typeAnnotation
            .map((type) => type.tokenRange()[1])
            .unwrapOr(this.name),
        ),
    ];
  }
}

export class StructureDefinitonAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  placeholders!: Token<TokenKind>[];
  name!: Token<TokenKind>;
  fields!: FieldAstNode[];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<StructureDefinitonAstNode>) {
    Object.assign(this, params);
  }

  /**
   * Generates a composite symbol type of the struct with placeholders and fields.
   * However, the fields don't have their correct type yet.
   * The resulting type can be completed by calling `completeBarebonesSymbolType`,
   * which will add the missing field types.
   * This is useful for working with self-referential types.
   */
  generateBarebonesSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): CompositeSymbolType {
    const structureType = new CompositeSymbolType({
      id: this.name.text,
      placeholders: placeholderTypes,
    });
    for (const field of this.fields) {
      structureType.fields.set(field.name.text, field.resolvePreliminaryType());
    }
    return structureType;
  }

  /**
   * Adds the fields of the struct to a barebones symbol type.
   */
  completeBarebonesSymbolType(
    structureType: CompositeSymbolType,
    includeDefaultValues = false,
  ): SymbolType {
    const defaultValues = new Map<string, SymbolValue>();
    for (const field of this.fields) {
      const fieldName = field.name.text;
      const existingField = structureType.fields.get(fieldName);
      if (existingField === undefined) {
        throw new InternalError(
          `The field "${fieldName}" was not found in the structure "${this.name.text}".`,
        );
      }
      const fieldType = field.resolveType();
      existingField.bind(fieldType);
      if (includeDefaultValues) {
        field.defaultValue
          .map((node) => node.evaluate())
          .then((defaultValue) => {
            defaultValues.set(fieldName, defaultValue);
          });
      }
    }
    structureType.defaultValues = defaultValues;
    return structureType;
  }

  /**
   * Generates a composite symbol type of the struct with all its fields.
   */
  generateSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
    includeDefaultValues = false,
  ): SymbolType {
    const structureType = this.generateBarebonesSymbolType(placeholderTypes);
    typeTable.pushScope();
    typeTable.setType(
      this.name.text,
      structureType,
    );
    const completeType = this.completeBarebonesSymbolType(
      structureType,
      includeDefaultValues,
    );
    typeTable.popScope();
    return completeType;
  }

  analyze(): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    typeTable.findType(this.name.text)
      .then(([_type, flags]) => {
        if (flags.readonly) {
          findings.errors.push(AnalysisError({
            message:
              "This name cannot be used because it is part of the language.",
            beginHighlight: DummyAstNode.fromToken(this.name),
            endHighlight: None(),
            messageHighlight: "",
          }));
        } else {
          findings.errors.push(AnalysisError({
            message: "Names for structures have to be unique.",
            beginHighlight: DummyAstNode.fromToken(this.name),
            endHighlight: None(),
            messageHighlight:
              `A structure by the name "${this.name.text}" already exists.`,
          }));
        }
      });
    let unproblematicPlaceholders: string[] = [];
    for (const placeholder of this.placeholders) {
      typeTable.findType(placeholder.text)
        .then(() => {
          findings.errors.push(AnalysisError({
            message:
              "Placeholders cannot have the same name as types that already exist in an outer scope.",
            beginHighlight: DummyAstNode.fromToken(placeholder),
            endHighlight: None(),
            messageHighlight:
              `A type by the name "${placeholder.text}" already exists.`,
          }));
        })
        .onNone(() => {
          unproblematicPlaceholders.push(placeholder.text);
        });
    }
    const placeholderDuplicates = findDuplicates(
      this.placeholders.map((p) => p.text),
    );
    for (const [placeholder, indices] of placeholderDuplicates) {
      const duplicateCount = indices.length;
      findings.errors.push(AnalysisError({
        message: "The names of placeholders have to be unique.",
        beginHighlight: DummyAstNode.fromToken(this.placeholders[indices[1]]),
        endHighlight: None(),
        messageHighlight:
          `The placeholder called "${placeholder}" exists a total of ${duplicateCount} times in this structure.`,
      }));
      unproblematicPlaceholders = removeAll(
        unproblematicPlaceholders,
        placeholder,
      );
    }
    const unproblematicPlaceholderTypes = new Map(
      unproblematicPlaceholders.map(
        (
          placeholder,
        ) => [placeholder, new PlaceholderSymbolType({ name: placeholder })],
      ),
    );
    typeTable.pushScope();
    for (
      const [placeholerName, placeholderType] of unproblematicPlaceholderTypes
    ) {
      typeTable.setType(placeholerName, placeholderType);
    }
    const incompleteStructureType = this.generateBarebonesSymbolType(
      unproblematicPlaceholderTypes,
    );
    typeTable.setType(
      this.name.text,
      incompleteStructureType,
    );
    const fieldNames: string[] = [];
    // First (preliminary) pass of the analysis without field types set
    let preliminaryFindings = AnalysisFindings.empty();
    for (const field of this.fields) {
      preliminaryFindings = AnalysisFindings.merge(
        preliminaryFindings,
        field.analyze(),
      );
      const fieldName = field.name.text;
      if (fieldNames.includes(fieldName)) {
        findings.errors.push(AnalysisError({
          message: "Fields inside of a structure have to have a unique name.",
          beginHighlight: DummyAstNode.fromToken(field.name),
          endHighlight: None(),
          messageHighlight:
            `The field called "${fieldName}" already exists in the structure.`,
        }));
      }
      fieldNames.push(fieldName);
    }
    if (findings.isErroneous() || preliminaryFindings.isErroneous()) {
      typeTable.popScope();
      return AnalysisFindings.merge(findings, preliminaryFindings);
    }
    const structureType = this.completeBarebonesSymbolType(
      incompleteStructureType,
    );
    // Second pass of the analysis with field types set
    const fieldFindings = this.fields
      .map((field) => field.analyze())
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    findings = AnalysisFindings.merge(findings, fieldFindings);
    typeTable.popScope();
    if (findings.isErroneous()) {
      return findings;
    }
    typeTable.setType(
      this.name.text,
      structureType,
    );
    return findings;
  }

  interpret(): void {
    const placeholderTypes = new Map(
      this.placeholders.map(
        (
          placeholder,
        ) => [
          placeholder.text,
          new PlaceholderSymbolType({ name: placeholder.text }),
        ],
      ),
    );
    typeTable.pushScope();
    for (const [placeholderName, placeholderType] of placeholderTypes) {
      typeTable.setType(placeholderName, placeholderType);
    }
    const structureType = this.generateSymbolType(
      placeholderTypes,
      true,
    );
    typeTable.popScope();
    typeTable.setType(
      this.name.text,
      structureType,
    );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.closingBrace];
  }
}

/* PARSER */

const placeholderNames = kleft(
  list_sc(tok(TokenKind.ident), surround_with_breaking_whitespace(str(","))),
  opt_sc(str(",")),
);

const placeholders = kmid(
  str<TokenKind>("<"),
  surround_with_breaking_whitespace(opt_sc(placeholderNames)),
  str<TokenKind>(">"),
);

const typeAnnotation = kright(
  str<TokenKind>(":"),
  starts_with_breaking_whitespace(typeLiteral),
);

const defaultValue = kright(
  str<TokenKind>("="),
  starts_with_breaking_whitespace(expression),
);

const field = apply(
  seq(
    tok(TokenKind.ident),
    opt_sc(starts_with_breaking_whitespace(typeAnnotation)),
    opt_sc(starts_with_breaking_whitespace(defaultValue)),
  ),
  ([fieldName, fieldType, defaultValue]) =>
    new FieldAstNode({
      name: fieldName,
      typeAnnotation: fieldType,
      defaultValue: defaultValue,
    }),
);

const fieldSeparator = alt(
  surround_with_breaking_whitespace(str(",")),
  tok(TokenKind.breakingWhitespace),
);

const fields = kleft(
  list_sc(
    field,
    fieldSeparator,
  ),
  opt_sc(str(",")),
);

export const structureDefinition = apply(
  seq(
    str<TokenKind>("structure"),
    opt_sc(surround_with_breaking_whitespace(placeholders)),
    surround_with_breaking_whitespace(tok(TokenKind.ident)),
    opt_sc(surround_with_breaking_whitespace(placeholders)),
    seq(
      kright(
        str("{"),
        surround_with_breaking_whitespace(opt_sc(fields)),
      ),
      str("}"),
    ),
  ),
  ([keyword, placeholdersA, typeName, placeholdersB, [fields, closingBrace]]) =>
    new StructureDefinitonAstNode({
      keyword: keyword,
      placeholders: [...(placeholdersA ?? []), ...(placeholdersB ?? [])],
      name: typeName,
      fields: fields ?? [],
      closingBrace: closingBrace,
    }),
);
