import {
  alt,
  apply,
  kleft,
  kright,
  list_sc,
  opt,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { CompositeSymbolType, typeTable } from "../type.ts";
import { UnresolvableSymbolTypeError } from "../util/error.ts";
import { None } from "../util/monad/option.ts";
import { kouter, surround_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

export class StructureDefiniitonAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  name!: Token<TokenKind>;
  fields!: [Token<TokenKind>, Token<TokenKind>][];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<StructureDefiniitonAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    typeTable.findType(this.name.text)
      .then(() => {
        findings.errors.push(AnalysisError({
          message: "Names for structures have to be unique.",
          // TODO: Find a way to only highlight the name, e.g. through a dummy AST node created on the spot
          beginHighlight: this,
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
          // TODO: Find a way to only highlight the type, e.g. through a dummy AST node created on the spot
          beginHighlight: this,
          endHighlight: None(),
          messageHighlight: `The type called "${
            field[0].text
          }" could not be found.`,
        }));
      });
      const fieldName = field[0].text;
      if (fieldNames.includes(fieldName)) {
        findings.errors.push(AnalysisError({
          message: "Fields inside of a structure have to have a unique name.",
          beginHighlight: this,
          endHighlight: None(),
          messageHighlight:
            `The field called "${this.name.text}" exists at least twice in the structure.`,
        }));
      }
      fieldNames.push(fieldName);
    }
    return findings;
  }

  interpret(): void {
    const structureType = new CompositeSymbolType({ fields: new Map() });
    for (const field of this.fields) {
      const fieldName = field[0].text;
      const fieldType = typeTable.findType(field[1].text);
      structureType.fields.set(
        fieldName,
        fieldType.unwrapOrThrow(UnresolvableSymbolTypeError()),
      );
    }
    typeTable.setType(this.name.text, structureType);
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
  opt(str(",")),
);

export const structureDefinition = apply(
  seq(
    str<TokenKind>("structure"),
    surround_with_breaking_whitespace(tok(TokenKind.ident)),
    seq(
      kright(
        str("{"),
        opt(surround_with_breaking_whitespace(fields)),
      ),
      str("}"),
    ),
  ),
  ([keyword, typeName, [fields, closingBrace]]) =>
    new StructureDefiniitonAstNode({
      keyword: keyword,
      name: typeName,
      fields: fields ?? [],
      closingBrace: closingBrace,
    }),
);
