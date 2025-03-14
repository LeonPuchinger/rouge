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
  PlaceholderSymbolType,
  SymbolType,
  typeTable,
} from "../type.ts";
import { findDuplicates, removeAll } from "../util/array.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import {
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { FunctionDefinitionAstNode } from "./function.ts";
import { typeLiteral, TypeLiteralAstNode } from "./type_literal.ts";

/* AST NODES */

class FieldAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  expression!: Option<ExpressionAstNode>;

  constructor(params: WithOptionalAttributes<FieldAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
    this.expression = Some(params.expression);
  }

  evaluate(): SymbolValue<unknown> {
    throw new Error("Method not implemented.");
  }

  resolveType(): SymbolType {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    throw new Error("Method not implemented.");
  }
}

export class StructureDefinitonAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  placeholders!: Token<TokenKind>[];
  name!: Token<TokenKind>;
  fields!: [
    Token<TokenKind>,
    Option<TypeLiteralAstNode>,
    Option<ExpressionAstNode>,
  ][];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<StructureDefinitonAstNode>) {
    Object.assign(this, params);
  }

  /**
   * Generates a composite symbol type of the struct with all its fields.
   */
  generateSymbolType(
    placeholderTypes?: Map<string, PlaceholderSymbolType>,
  ): SymbolType {
    const structureType = new CompositeSymbolType({
      id: this.name.text,
      placeholders: placeholderTypes,
    });
    for (const [fieldNameToken, fieldTypeNode] of this.fields) {
      const fieldName = fieldNameToken.text;
      const fieldType = fieldTypeNode.resolveType();
      structureType.fields.set(fieldName, fieldType);
    }
    typeTable.setType(this.name.text, structureType);
    return structureType;
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
    const fieldNames: string[] = [];
    for (const [fieldNameToken, fieldTypeNode] of this.fields) {
      const fieldTypeFindings = fieldTypeNode.analyze();
      findings = AnalysisFindings.merge(findings, fieldTypeFindings);
      const fieldName = fieldNameToken.text;
      if (fieldNames.includes(fieldName)) {
        findings.errors.push(AnalysisError({
          message: "Fields inside of a structure have to have a unique name.",
          beginHighlight: DummyAstNode.fromToken(fieldNameToken),
          endHighlight: None(),
          messageHighlight:
            `The field called "${fieldName}" already exists in the structure.`,
        }));
      }
      fieldNames.push(fieldName);
    }
    if (!findings.isErroneous()) {
      const structureType = this.generateSymbolType(
        unproblematicPlaceholderTypes,
      );
      typeTable.popScope();
      typeTable.setType(
        this.name.text,
        structureType,
      );
    }
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

class MethodDefinitionAstNode implements EvaluableAstNode {
  name!: Token<TokenKind>;
  typeAnnotation!: Option<TypeLiteralAstNode>;
  function!: FunctionDefinitionAstNode;

  constructor(params: WithOptionalAttributes<MethodDefinitionAstNode>) {
    Object.assign(this, params);
    this.typeAnnotation = Some(params.typeAnnotation);
  }

  evaluate(): SymbolValue<unknown> {
    throw new Error("Method not implemented.");
  }

  resolveType(): SymbolType {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    throw new Error("Method not implemented.");
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
    // Typescripts type checker is not so smart sometimes.
    // It needs to be reminded that this is a tuple, not an array.
    <[
      Token<TokenKind>,
      Option<TypeLiteralAstNode>,
      Option<ExpressionAstNode>,
    ]> [
      fieldName,
      Some(fieldType),
      Some(defaultValue),
    ],
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
