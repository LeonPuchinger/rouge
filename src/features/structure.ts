import { kmid, list_sc, seq, str, tok } from "typescript-parsec";
import { TokenKind } from "../lexer.ts";

/* PARSERS */

const field = seq(
  tok(TokenKind.ident),
  str(":"),
  tok(TokenKind.ident),
);

const fields = list_sc(
  field,
  str(","),
);

export const structureDefinition = seq(
  str("structure"),
  tok(TokenKind.ident),
  kmid(
    str("{"),
    fields,
    str("}"),
  ),
);
