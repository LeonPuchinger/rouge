import { apply, list_sc, seq, str, tok, Token } from "typescript-parsec";
import { InterpretableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
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

  interpret(): void {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
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
