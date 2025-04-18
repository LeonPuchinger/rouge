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
import {
  compositeTypeLiteral,
  CompositeTypeLiteralAstNode,
  typeLiteral,
  TypeLiteralAstNode,
} from "./type_literal.ts";

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
          "A field has to have at least a type annotation or a default value.",
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

export class TypeDefinitionAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  placeholders!: Token<TokenKind>[];
  traits!: CompositeTypeLiteralAstNode[];
  name!: Token<TokenKind>;
  fields!: FieldAstNode[];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<TypeDefinitionAstNode>) {
    Object.assign(this, params);
  }

  /**
   * Generates a composite symbol type of the type definition with placeholders and fields.
   * However, the fields don't have their correct type yet.
   * The resulting type can be completed by calling `completeBarebonesSymbolType`,
   * which will add the missing field types.
   * This is useful for working with self-referential types.
   */
  generateBarebonesSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): CompositeSymbolType {
    const traitTypes = this.traits.map((trait) => trait.resolveType());
    const definitionType = new CompositeSymbolType({
      id: this.name.text,
      placeholders: placeholderTypes,
      traits: traitTypes,
    });
    for (const field of this.fields) {
      definitionType.fields.set(
        field.name.text,
        field.resolvePreliminaryType(),
      );
    }
    return definitionType;
  }

  /**
   * Adds the fields of the type definition to a barebones symbol type.
   */
  completeBarebonesSymbolType(
    definitionType: CompositeSymbolType,
  ): SymbolType {
    for (const field of this.fields) {
      const fieldName = field.name.text;
      const existingField = definitionType.fields.get(fieldName);
      if (existingField === undefined) {
        throw new InternalError(
          `The field "${fieldName}" was not found in the type "${this.name.text}".`,
        );
      }
      const fieldType = field.resolveType();
      existingField.bind(fieldType);
    }
    return definitionType;
  }

  /**
   * Generates a composite symbol type of the type definition with all its fields.
   */
  generateSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): SymbolType {
    const definitionType = this.generateBarebonesSymbolType(placeholderTypes);
    typeTable.pushScope();
    typeTable.setType(
      this.name.text,
      definitionType,
    );
    const completeType = this.completeBarebonesSymbolType(
      definitionType,
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
    definitionType: SymbolType,
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
        returnType: definitionType,
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
    definitionType: SymbolType,
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
        returnType: definitionType,
        placeholders: placeholders,
      }),
    });
  }

  /**
   * Makes sure there are no two traits that require the same field
   * to be implemented with incompatible types.
   */
  ensureNoOverlappingBehavior(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const existingFields = new Map<
      string,
      { fieldType: SymbolType; requiredBy: SymbolType }
    >();
    for (const trait of this.traits) {
      const traitType = trait.resolveType();
      for (const [fieldName, fieldType] of traitType.fields) {
        const existingField = existingFields.get(fieldName);
        if (
          existingField !== undefined &&
          !existingField.fieldType.typeCompatibleWith(fieldType)
        ) {
          findings.errors.push(AnalysisError({
            message:
              `The field '${fieldName}' is required by the traits '${existingField.requiredBy.displayName()}' and '${traitType.displayName()}' with different types.`,
            beginHighlight: DummyAstNode.fromToken(this.name),
            endHighlight: None(),
            messageHighlight:
              `The field is expected to be of type '${existingField.fieldType.displayName()}' but instead is of type '${fieldType.displayName()}'.`,
          }));
        } else {
          existingFields.set(fieldName, { fieldType, requiredBy: traitType });
        }
      }
    }
    return findings;
  }

  /**
   * Generates a map of fields that need to be implemented by this
   * type, imposed upon by the traits it implements. It is assumed
   * that the traits do not have any overlapping fields with different types.
   * The returned object maps the name of the field to the type of
   * the field, as well as the trait that requires the field.
   * It is assumed that static analysis on the traits has passed
   * without errors before this method is called.
   */
  requiredBehavior(): Map<
    string,
    { fieldType: SymbolType; requiredBy: SymbolType }
  > {
    const requiredBehavior = new Map<
      string,
      { fieldType: SymbolType; requiredBy: SymbolType }
    >();
    for (const trait of this.traits.toReversed()) {
      const traitType = trait.resolveType();
      for (const [fieldName, fieldType] of traitType.fields) {
        requiredBehavior.set(fieldName, {
          fieldType: fieldType,
          requiredBy: traitType,
        });
      }
    }
    return requiredBehavior;
  }

  /**
   * Ensures that the given set of fields is
   * implemented using the correct types.
   */
  ensureBehaviorisImplemented(
    behavior: Map<string, { fieldType: SymbolType; requiredBy: SymbolType }>,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    for (const [fieldName, { fieldType, requiredBy }] of behavior) {
      const implementedField = this.fields.find((field) =>
        field.name.text === fieldName
      );
      if (implementedField === undefined) {
        findings.errors.push(AnalysisError({
          message:
            `The field '${fieldName}' is required by the trait '${requiredBy.displayName()}' but is not implemented on '${this.name.text}'.`,
          beginHighlight: DummyAstNode.fromToken(this.name),
          endHighlight: None(),
          messageHighlight: "",
        }));
      } else {
        const implementedType = implementedField.resolveType();
        if (!implementedType.typeCompatibleWith(fieldType)) {
          findings.errors.push(AnalysisError({
            message:
              `The type of the field '${fieldName}' is incompatible with the type required by the trait '${requiredBy.displayName()}'.`,
            beginHighlight: DummyAstNode.fromToken(implementedField.name),
            endHighlight: None(),
            messageHighlight:
              `The field is expected to be of type '${fieldType.displayName()}' but instead is of type '${implementedType.displayName()}'.`,
          }));
        }
      }
    }
    return findings;
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
            message: "Names for types have to be unique.",
            beginHighlight: DummyAstNode.fromToken(this.name),
            endHighlight: None(),
            messageHighlight:
              `A type by the name "${this.name.text}" already exists.`,
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
            "A placeholder cannot share the same name as its surrounding type.",
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
          `The placeholder called "${placeholder}" exists a total of ${duplicateCount} times in this type.`,
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
    const traitFindings = this.traits
      .map((trait) => trait.analyze())
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    const traitConflictFindings = this.ensureNoOverlappingBehavior();
    findings = AnalysisFindings.merge(
      findings,
      traitFindings,
      traitConflictFindings,
    );
    const sharedBehavior = this.requiredBehavior();
    findings = AnalysisFindings.merge(
      findings,
      this.ensureBehaviorisImplemented(sharedBehavior),
    );
    const incompletedefinitionType = this.generateBarebonesSymbolType(
      unproblematicPlaceholderTypes,
    );
    typeTable.setType(
      this.name.text,
      incompletedefinitionType,
    );
    const mockConstructor = this.generateMockConstructorStaticSymbol(
      incompletedefinitionType,
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
          message: "Fields inside of a type have to have a unique name.",
          beginHighlight: DummyAstNode.fromToken(field.name),
          endHighlight: None(),
          messageHighlight:
            `The field called "${fieldName}" already exists in the type.`,
        }));
      }
      fieldNames.push(fieldName);
    }
    if (findings.isErroneous() || preliminaryFindings.isErroneous()) {
      typeTable.popScope();
      return AnalysisFindings.merge(findings, preliminaryFindings);
    }
    const definitionType = this.completeBarebonesSymbolType(
      incompletedefinitionType,
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
      incompletedefinitionType,
      unproblematicPlaceholderTypes,
    );
    typeTable.popScope();
    if (findings.isErroneous()) {
      return findings;
    }
    typeTable.setType(
      this.name.text,
      definitionType,
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
    definitionType: SymbolType,
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
      definitionType,
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
    const definitionType = this.generateSymbolType(placeholderTypes);
    typeTable.popScope();
    typeTable.setType(
      this.name.text,
      definitionType,
    );
    const constructor = this.generateConstructorRuntimeSymbol(
      definitionType,
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

const traitTypes = kleft(
  list_sc(
    compositeTypeLiteral,
    surround_with_breaking_whitespace(str(",")),
  ),
  opt_sc(str(",")),
);

const traits = kright(
  str<TokenKind>("implements"),
  starts_with_breaking_whitespace(traitTypes),
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

export const typeDefinition = apply(
  seq(
    str<TokenKind>("type"),
    opt_sc(surround_with_breaking_whitespace(placeholders)),
    surround_with_breaking_whitespace(tok(TokenKind.ident)),
    opt_sc(surround_with_breaking_whitespace(placeholders)),
    opt_sc(surround_with_breaking_whitespace(traits)),
    seq(
      kright(
        str("{"),
        surround_with_breaking_whitespace(opt_sc(fields)),
      ),
      str("}"),
    ),
  ),
  (
    [
      keyword,
      placeholdersA,
      typeName,
      placeholdersB,
      traits,
      [fields, closingBrace],
    ],
  ) =>
    new TypeDefinitionAstNode({
      keyword: keyword,
      placeholders: [...(placeholdersA ?? []), ...(placeholdersB ?? [])],
      traits: traits ?? [],
      name: typeName,
      fields: fields ?? [],
      closingBrace: closingBrace,
    }),
);
