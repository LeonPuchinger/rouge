/* PARSER */

import {
  alt_sc,
  apply,
  list_sc,
  opt_sc,
  seq,
  str,
  tok,
} from "typescript-parsec";
import { TokenType } from "../lexer.ts";
import { Some } from "../util/monad/index.ts";
import { statements } from "../parser.ts";

const parameter = seq(
  tok(TokenType.ident),
  str(":"),
  tok(TokenType.ident),
);

const parameters = alt_sc(
  list_sc(parameter, str(",")),
  parameter,
);

const returnType = apply(
  opt_sc(tok(TokenType.ident)),
  (token) => Some(token).map((token) => token.text),
);

export const functionDefinition = seq(
  str("function"),
  str("("),
  parameters,
  str(")"),
  seq(str("-"), str(">")),
  returnType,
  str("{"),
  statements,
  str("}"),
);
