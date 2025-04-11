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
import { createRuntimeBindingRuntimeSymbol } from "../runtime.ts";
import {
  analysisTable,
  CompositeSymbolValue,
  RuntimeSymbol,
  runtimeTable,
  StaticSymbol,
  SymbolFlags,
  SymbolValue,
} from "../symbol.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
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

  hasDefaultValue(): boolean {
    return this.defaultValue.hasValue();
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

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
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
  ): SymbolType {
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
    }
    return structureType;
  }

  /**
   * Generates a composite symbol type of the struct with all its fields.
   */
  generateSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): SymbolType {
    const structureType = this.generateBarebonesSymbolType(placeholderTypes);
    typeTable.pushScope();
    typeTable.setType(
      this.name.text,
      structureType,
    );
    const completeType = this.completeBarebonesSymbolType(
      structureType,
    );
    typeTable.popScope();
    return completeType;
  }

  /**
   * Generates a static symbol for the constructor of the struct.
   * The constructor accepts values for all fields that don't
   * have a default value. It is assumed that fields with default
   * parameters are located at the end of the list of fields.
   */
  generateConstructorStaticSymbol(
    structureType: SymbolType,
    placeholders: Map<string, PlaceholderSymbolType>,
  ): StaticSymbol {
    const nonDefaultParameters: SymbolType[] = [];
    for (const field of this.fields) {
      if (!field.hasDefaultValue()) {
        nonDefaultParameters.push(field.resolveType());
      }
    }
    return new StaticSymbol({
      valueType: new FunctionSymbolType({
        parameterTypes: nonDefaultParameters,
        returnType: structureType,
        placeholders: placeholders,
      }),
    });
  }

  /**
   * Similar to `generateConstructorStaticSymbol`, but the parameters
   * are all of type `IgnoreSymbolType`. This allows static analysis
   * to check whether the constructor is called with the correct number
   * of arguments. Only in a later pass are the parameters checked
   * for type compatibility.
   */
  generateMockConstructorStaticSymbol(
    structureType: SymbolType,
    placeholders: Map<string, PlaceholderSymbolType>,
  ): StaticSymbol {
    const nonDefaultParameters: SymbolType[] = [];
    for (const field of this.fields) {
      if (!field.hasDefaultValue()) {
        nonDefaultParameters.push(new IgnoreSymbolType());
      }
    }
    return new StaticSymbol({
      valueType: new FunctionSymbolType({
        parameterTypes: nonDefaultParameters,
        returnType: structureType,
        placeholders: placeholders,
      }),
    });
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
    type FieldInitializerMode = "positional" | "default";
    this.fields.reduce<FieldInitializerMode>(
      (mode, field) => {
        if (mode === "default" && !field.hasDefaultValue()) {
          findings.errors.push(AnalysisError({
            message:
              "Fields without default values have to come before fields with default values.",
            beginHighlight: DummyAstNode.fromToken(field.name),
            endHighlight: None(),
            messageHighlight:
              `The field "${field.name.text}" does not have a default value.`,
          }));
        }
        return field.hasDefaultValue() ? "default" : mode;
      },
      "positional",
    );
    let unproblematicPlaceholders: string[] = [];
    for (const placeholder of this.placeholders) {
      let problematic = false;
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
          problematic = true;
        });
      if (placeholder.text === this.name.text) {
        findings.errors.push(AnalysisError({
          message:
            "A placeholder cannot share the same name as its surrounding structure.",
          beginHighlight: DummyAstNode.fromToken(placeholder),
          endHighlight: None(),
          messageHighlight: "",
        }));
        problematic = true;
      }
      if (!problematic) {
        unproblematicPlaceholders.push(placeholder.text);
      }
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
    const mockConstructor = this.generateMockConstructorStaticSymbol(
      incompleteStructureType,
      unproblematicPlaceholderTypes,
    );
    analysisTable.setSymbol(
      this.name.text,
      mockConstructor,
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
    const constructor = this.generateConstructorStaticSymbol(
      incompleteStructureType,
      unproblematicPlaceholderTypes,
    );
    typeTable.popScope();
    if (findings.isErroneous()) {
      return findings;
    }
    typeTable.setType(
      this.name.text,
      structureType,
    );
    analysisTable.setSymbol(this.name.text, constructor);
    return findings;
  }

  /**
   * Similar to `generateConstructorStaticSymbol`, but creates
   * a runtime symbol that actually contains the constructor logic.
   * The constructor is implemented as a runtime binding, which means
   * it makes use of functionality that is also used by the runtime.
   */
  generateConstructorRuntimeSymbol(
    structureType: SymbolType,
    placeholders: Map<string, PlaceholderSymbolType>,
  ): RuntimeSymbol {
    const nonDefaultParameters: {
      name: string;
      symbolType: SymbolType;
    }[] = [];
    const fieldTypes = new Map<string, SymbolType>();
    typeTable.pushScope();
    for (const [placeholderName, placeholderType] of placeholders) {
      typeTable.setType(placeholderName, placeholderType);
    }
    for (const field of this.fields) {
      if (!field.hasDefaultValue()) {
        nonDefaultParameters.push({
          name: field.name.text,
          symbolType: field.resolveType(),
        });
      }
      fieldTypes.set(field.name.text, field.resolveType());
    }
    typeTable.popScope();
    return createRuntimeBindingRuntimeSymbol(
      nonDefaultParameters,
      structureType,
      (params) => {
        typeTable.pushScope();
        for (const [placeholderName, placeholderType] of placeholders) {
          typeTable.setType(placeholderName, placeholderType);
        }
        const initializers = new Map<string, [SymbolValue, SymbolType]>();
        for (const field of this.fields) {
          if (params.has(field.name.text)) {
            initializers.set(
              field.name.text,
              [params.get(field.name.text)!, fieldTypes.get(field.name.text)!],
            );
          }
          if (field.hasDefaultValue()) {
            const defaultValue = field.defaultValue.unwrap().evaluate();
            initializers.set(
              field.name.text,
              [defaultValue, fieldTypes.get(field.name.text)!],
            );
          }
        }
        typeTable.popScope();
        const instance = new CompositeSymbolValue({
          fields: initializers,
          id: this.name.text,
        });
        return instance;
      },
      placeholders,
    );
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
    const structureType = this.generateSymbolType(placeholderTypes);
    typeTable.popScope();
    typeTable.setType(
      this.name.text,
      structureType,
    );
    const constructor = this.generateConstructorRuntimeSymbol(
      structureType,
      placeholderTypes,
    );
    runtimeTable.setSymbol(this.name.text, constructor);
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
