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
import { AstNode, EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { createRuntimeBindingRuntimeSymbol } from "../runtime.ts";
import {
  CompositeSymbolValue,
  RuntimeSymbol,
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

  resolveType(environment: ExecutionEnvironment): SymbolType {
    return (this.typeAnnotation as Option<
      TypeLiteralAstNode | ExpressionAstNode
    >)
      .or(this.defaultValue)
      .map((node) => node.resolveType(environment))
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

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const typeAnnotationFindings = this.typeAnnotation
      .map((typeAnnotation) => typeAnnotation.analyze(environment))
      .unwrapOr(AnalysisFindings.empty());
    const defaultValueFindings = this.defaultValue
      .map((defaultValue) => defaultValue.analyze(environment))
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
      const typeAnnotationType = typeAnnotation.resolveType(environment);
      const expressionType = expression.resolveType(environment);
      if (!expressionType.typeCompatibleWith(typeAnnotationType)) {
        findings.errors.push(AnalysisError(environment, {
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
      findings.errors.push(AnalysisError(environment, {
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

  resolveFlags(
    _environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
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
    traitTypes: CompositeSymbolType[],
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): CompositeSymbolType {
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
    environment: ExecutionEnvironment,
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
      const fieldType = field.resolveType(environment);
      existingField.bind(fieldType);
    }
    return definitionType;
  }

  /**
   * Generates a composite symbol type of the type definition with all its fields.
   */
  generateSymbolType(
    environment: ExecutionEnvironment,
    traitTypes: CompositeSymbolType[],
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): SymbolType {
    const definitionType = this.generateBarebonesSymbolType(
      traitTypes,
      placeholderTypes,
    );
    environment.typeTable.pushScope();
    environment.typeTable.setType(
      this.name.text,
      definitionType,
    );
    const completeType = this.completeBarebonesSymbolType(
      environment,
      definitionType,
    );
    environment.typeTable.popScope();
    return completeType;
  }

  /**
   * Generates a static symbol for the constructor of the struct.
   * The constructor accepts values for all fields that don't
   * have a default value. It is assumed that fields with default
   * parameters are located at the end of the list of fields.
   */
  generateConstructorStaticSymbol(
    environment: ExecutionEnvironment,
    definitionType: SymbolType,
    placeholders: Map<string, PlaceholderSymbolType>,
  ): StaticSymbol {
    const nonDefaultParameters: SymbolType[] = [];
    for (const field of this.fields) {
      if (!field.hasDefaultValue()) {
        nonDefaultParameters.push(field.resolveType(environment));
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

  getFieldAstNodeByName(name: string): Option<AstNode> {
    return Some(
      this.fields.find((field) => field.name.text === name),
    );
  }

  /**
   * Make sure none of the traits are placeholders.
   */
  ensureTraitsAreBound(
    environment: ExecutionEnvironment,
    unproblematicTraits: CompositeTypeLiteralAstNode[],
  ): AnalysisFindings {
    const errors = unproblematicTraits
      .map((node) =>
        [node, node.resolveType(environment)] as [AstNode, SymbolType]
      )
      .filter(([_node, type]) => !type.bound())
      .map(([node, _type]) => node)
      .map((node) => {
        return AnalysisError(environment, {
          message: "Placeholders cannot be implemented.",
          beginHighlight: node,
          endHighlight: None(),
          messageHighlight: "",
        });
      });
    return new AnalysisFindings({
      warnings: [],
      errors: errors,
    });
  }

  /**
   * Makes sure there are no two traits that require the same field
   * to be implemented with incompatible types.
   */
  ensureNoOverlappingBehavior(
    environment: ExecutionEnvironment,
    unproblematicTraits: CompositeTypeLiteralAstNode[],
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const existingFields = new Map<
      string,
      { fieldType: SymbolType; requiredBy: SymbolType }
    >();
    for (const trait of unproblematicTraits) {
      const traitType = trait.resolveType(environment);
      for (const [fieldName, fieldType] of traitType.fields) {
        const existingField = existingFields.get(fieldName);
        if (
          existingField !== undefined &&
          !existingField.fieldType.typeCompatibleWith(fieldType)
        ) {
          findings.errors.push(AnalysisError(environment, {
            message:
              "It is not possible for two traits to require the same field, but with different types.",
            beginHighlight: this
              .getFieldAstNodeByName(fieldName)
              .unwrapOr(DummyAstNode.fromToken(this.name)),
            endHighlight: None(),
            messageHighlight:
              `The field '${fieldName}' is required by the traits '${existingField.requiredBy.displayName()}' and '${traitType.displayName()}' with different types.`,
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
  requiredBehavior(
    environment: ExecutionEnvironment,
    unproblematicTraits: CompositeTypeLiteralAstNode[],
  ): Map<
    string,
    { fieldType: SymbolType; requiredBy: SymbolType }
  > {
    const requiredBehavior = new Map<
      string,
      { fieldType: SymbolType; requiredBy: SymbolType }
    >();
    for (const trait of unproblematicTraits.toReversed()) {
      const traitType = trait.resolveType(environment);
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
    environment: ExecutionEnvironment,
  ): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    for (const [fieldName, { fieldType, requiredBy }] of behavior) {
      const implementedField = this.fields.find((field) =>
        field.name.text === fieldName
      );
      if (implementedField === undefined) {
        findings.errors.push(AnalysisError(environment, {
          message:
            `The field '${fieldName}' is required by the trait '${requiredBy.displayName()}' but is not implemented on '${this.name.text}'.`,
          beginHighlight: DummyAstNode.fromToken(this.name),
          endHighlight: None(),
          messageHighlight: "",
        }));
      } else {
        const implementedType = implementedField.resolveType(environment);
        if (!implementedType.typeCompatibleWith(fieldType)) {
          findings.errors.push(AnalysisError(environment, {
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

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    environment.typeTable.findType(this.name.text)
      .then(([_type, flags]) => {
        if (!flags.readonly) {
          return;
        }
        if (flags.stdlib) {
          findings.errors.push(AnalysisError(environment, {
            message:
              "This name cannot be used because it is part of the language.",
            beginHighlight: DummyAstNode.fromToken(this.name),
            endHighlight: None(),
            messageHighlight: "",
          }));
        } else {
          findings.errors.push(AnalysisError(environment, {
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
          findings.errors.push(AnalysisError(environment, {
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
      environment.typeTable.findType(placeholder.text)
        .then(() => {
          findings.errors.push(AnalysisError(environment, {
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
        findings.errors.push(AnalysisError(environment, {
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
      findings.errors.push(AnalysisError(environment, {
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
    // return erroneous findings early to prevent errors
    // when modifying the symbol and type tables.
    if (findings.isErroneous()) {
      return findings;
    }
    environment.typeTable.pushScope();
    for (
      const [placeholerName, placeholderType] of unproblematicPlaceholderTypes
    ) {
      environment.typeTable.setType(placeholerName, placeholderType);
    }
    const analyzedTraits = this.traits
      .map((trait) =>
        [trait, trait.analyze(environment)] as [
          CompositeTypeLiteralAstNode,
          AnalysisFindings,
        ]
      );
    const unproblematicTraits = analyzedTraits
      .filter(([_trait, findings]) => !findings.isErroneous())
      .map(([trait, _findings]) => trait);
    const traitFindings = analyzedTraits
      .map(([_trait, findings]) => findings)
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    const traitTypeFindings = this.ensureTraitsAreBound(
      environment,
      unproblematicTraits,
    );
    const traitConflictFindings = this.ensureNoOverlappingBehavior(
      environment,
      unproblematicTraits,
    );
    findings = AnalysisFindings.merge(
      findings,
      traitFindings,
      traitTypeFindings,
      traitConflictFindings,
    );
    const unproblematicTraitsTypes = unproblematicTraits
      .map((trait) => trait.resolveType(environment));
    const incompletedefinitionType = this.generateBarebonesSymbolType(
      unproblematicTraitsTypes,
      unproblematicPlaceholderTypes,
    );
    environment.typeTable.setType(
      this.name.text,
      incompletedefinitionType,
    );
    const sharedBehavior = this.requiredBehavior(
      environment,
      unproblematicTraits,
    );
    findings = AnalysisFindings.merge(
      findings,
      this.ensureBehaviorisImplemented(sharedBehavior, environment),
    );
    const mockConstructor = this.generateMockConstructorStaticSymbol(
      incompletedefinitionType,
      unproblematicPlaceholderTypes,
    );
    environment.analysisTable.pushScope();
    environment.analysisTable.setSymbol(
      this.name.text,
      mockConstructor,
    );
    const fieldNames: string[] = [];
    // First (preliminary) pass of the analysis without field types set
    let preliminaryFindings = AnalysisFindings.empty();
    for (const field of this.fields) {
      preliminaryFindings = AnalysisFindings.merge(
        preliminaryFindings,
        field.analyze(environment),
      );
      const fieldName = field.name.text;
      if (fieldNames.includes(fieldName)) {
        findings.errors.push(AnalysisError(environment, {
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
      environment.typeTable.popScope();
      return AnalysisFindings.merge(findings, preliminaryFindings);
    }
    const definitionType = this.completeBarebonesSymbolType(
      environment,
      incompletedefinitionType,
    );
    // Second pass of the analysis with field types set
    const fieldFindings = this.fields
      .map((field) => field.analyze(environment))
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        AnalysisFindings.empty(),
      );
    findings = AnalysisFindings.merge(findings, fieldFindings);
    const constructor = this.generateConstructorStaticSymbol(
      environment,
      incompletedefinitionType,
      unproblematicPlaceholderTypes,
    );
    environment.typeTable.popScope();
    if (findings.isErroneous()) {
      return findings;
    }
    environment.typeTable.setType(
      this.name.text,
      definitionType,
    );
    environment.analysisTable.popScope();
    environment.analysisTable.setSymbol(this.name.text, constructor);
    return findings;
  }

  /**
   * Similar to `generateConstructorStaticSymbol`, but creates
   * a runtime symbol that actually contains the constructor logic.
   * The constructor is implemented as a runtime binding, which means
   * it makes use of functionality that is also used by the runtime.
   */
  generateConstructorRuntimeSymbol(
    environment: ExecutionEnvironment,
    definitionType: SymbolType,
    placeholders: Map<string, PlaceholderSymbolType>,
  ): RuntimeSymbol {
    const nonDefaultParameters: {
      name: string;
      symbolType: SymbolType;
    }[] = [];
    const fieldTypes = new Map<string, SymbolType>();
    environment.typeTable.pushScope();
    for (const [placeholderName, placeholderType] of placeholders) {
      environment.typeTable.setType(placeholderName, placeholderType);
    }
    for (const field of this.fields) {
      if (!field.hasDefaultValue()) {
        nonDefaultParameters.push({
          name: field.name.text,
          symbolType: field.resolveType(environment),
        });
      }
      fieldTypes.set(field.name.text, field.resolveType(environment));
    }
    environment.typeTable.popScope();
    return createRuntimeBindingRuntimeSymbol(
      environment,
      nonDefaultParameters,
      definitionType,
      (params) => {
        environment.typeTable.pushScope();
        for (const [placeholderName, placeholderType] of placeholders) {
          environment.typeTable.setType(placeholderName, placeholderType);
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
            const defaultValue = field.defaultValue.unwrap().evaluate(
              environment,
            );
            initializers.set(
              field.name.text,
              [defaultValue, fieldTypes.get(field.name.text)!],
            );
          }
        }
        environment.typeTable.popScope();
        const instance = new CompositeSymbolValue({
          fields: initializers,
          id: this.name.text,
        });
        return instance;
      },
      placeholders,
    );
  }

  interpret(environment: ExecutionEnvironment): void {
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
    environment.typeTable.pushScope();
    for (const [placeholderName, placeholderType] of placeholderTypes) {
      environment.typeTable.setType(placeholderName, placeholderType);
    }
    const traitTypes = this.traits
      .map((trait) => trait.resolveType(environment));
    const definitionType = this.generateSymbolType(
      environment,
      traitTypes,
      placeholderTypes,
    );
    environment.typeTable.popScope();
    environment.typeTable.setType(
      this.name.text,
      definitionType,
    );
    const constructor = this.generateConstructorRuntimeSymbol(
      environment,
      definitionType,
      placeholderTypes,
    );
    environment.runtimeTable.setSymbol(this.name.text, constructor);
  }

  get_representation(environment: ExecutionEnvironment): string {
    this.interpret(environment);
    return "Nothing";
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.closingBrace];
  }
}

/* PARSER */

const placeholderNames = kleft(
  list_sc(tok(TokenKind.ident), surround_with_breaking_whitespace(str(","))),
  opt_sc(starts_with_breaking_whitespace(str(","))),
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
