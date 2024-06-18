import {
  alt,
  apply,
  kleft,
  kright,
  list_sc,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { CompositeSymbolType, SymbolType, typeTable } from "../type.ts";
import { UnresolvableSymbolTypeError } from "../util/error.ts";
import { None } from "../util/monad/option.ts";
import { kouter, surround_with_breaking_whitespace } from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

export class StructureDefinitonAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  name!: Token<TokenKind>;
  fields!: [Token<TokenKind>, Token<TokenKind>][];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<StructureDefinitonAstNode>) {
    Object.assign(this, params);
  }

  /**
   * Generates a composite symbol type of the struct with all its fields.
   */
  generateSymbolType(): SymbolType {
    const structureType = new CompositeSymbolType({ fields: {} });
    for (const field of this.fields) {
      const fieldName = field[0].text;
      const fieldType = typeTable.findType(field[1].text);
      structureType.fields.set(
        fieldName,
        fieldType.unwrapOrThrow(UnresolvableSymbolTypeError()),
      );
    }
    typeTable.setType(this.name.text, structureType);
    return structureType;
  }

  analyze(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    typeTable.findType(this.name.text)
      .then(() => {
        findings.errors.push(AnalysisError({
          message: "Names for structures have to be unique.",
          beginHighlight: DummyAstNode.fromToken(this.name),
          endHighlight: None(),
          messageHighlight:
            `A structure by the name "${this.name.text}" already exists.`,
        }));
      });
    const fieldNames: string[] = [];
    for (const field of this.fields) {
      const fieldType = typeTable.findType(field[1].text);
      fieldType.onNone(() => {
        findings.errors.push(AnalysisError({
          message:
            `The field called "${this.name.text}" has a type that does not exist.`,
          beginHighlight: DummyAstNode.fromToken(field[1]),
          endHighlight: None(),
          messageHighlight: `The type called "${
            field[1].text
          }" could not be found.`,
        }));
      });
      const fieldName = field[0].text;
      if (fieldNames.includes(fieldName)) {
        findings.errors.push(AnalysisError({
          message: "Fields inside of a structure have to have a unique name.",
          beginHighlight: DummyAstNode.fromToken(field[0]),
          endHighlight: None(),
          messageHighlight:
            `The field called "${fieldName}" already exists in the structure.`,
        }));
      }
      fieldNames.push(fieldName);
    }
    typeTable.setType(this.name.text, this.generateSymbolType());
    return findings;
  }

  interpret(): void {
    typeTable.setType(this.name.text, this.generateSymbolType());
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.keyword, this.closingBrace];
  }
}

/* PARSER */

const field = kouter(
  tok(TokenKind.ident),
  str(":"),
  tok(TokenKind.ident),
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
    surround_with_breaking_whitespace(tok(TokenKind.ident)),
    seq(
      kright(
        str("{"),
        surround_with_breaking_whitespace(opt_sc(fields)),
      ),
      str("}"),
    ),
  ),
  ([keyword, typeName, [fields, closingBrace]]) =>
    new StructureDefinitonAstNode({
      keyword: keyword,
      name: typeName,
      fields: fields ?? [],
      closingBrace: closingBrace,
    }),
);
