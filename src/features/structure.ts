import { apply, list_sc, seq, str, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { CompositeSymbolType, typeTable } from "../type.ts";
import { UnresolvableSymbolTypeError } from "../util/error.ts";
import { kouter } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

class StructureAstNode implements InterpretableAstNode {
  keyword!: Token<TokenKind>;
  name!: Token<TokenKind>;
  fields!: [Token<TokenKind>, Token<TokenKind>][];
  closingBrace!: Token<TokenKind>;

  constructor(params: Attributes<StructureAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  interpret(): void {
    const structureType = new CompositeSymbolType({ fields: new Map() });
    for (const field of this.fields) {
      const fieldType = typeTable.findType(field[1].text);
      structureType.fields.set(
        field[0].text,
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

const fields = list_sc(
  field,
  str(","),
);

export const structureDefinition = apply(
  seq(
    str<TokenKind>("structure"),
    tok(TokenKind.ident),
    seq(
      str("{"),
      fields,
      str("}"),
    ),
  ),
  ([keyword, typeName, [_, fields, closingBrace]]) =>
    new StructureAstNode({
      keyword: keyword,
      name: typeName,
      fields: fields,
      closingBrace: closingBrace,
    }),
);
