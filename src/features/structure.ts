import { apply, kmid, list_sc, seq, str, tok, Token } from "typescript-parsec";
import { TokenKind } from "../lexer.ts";
import { kouter } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

class StructureAstNode {
  keyword!: Token<TokenKind>;
  name!: Token<TokenKind>;
  fields!: [Token<TokenKind>, Token<TokenKind>][];

  constructor(params: Attributes<StructureAstNode>) {
    Object.assign(this, params);
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
    kmid(
      str("{"),
      fields,
      str("}"),
    ),
  ),
  ([keyword, typeName, fields]) =>
    new StructureAstNode({
      keyword: keyword,
      name: typeName,
      fields: fields,
    }),
);
