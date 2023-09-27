import { apply, rep, seq, tok } from "typescript-parsec";
import { AstNode, AstNodeType } from "./ast.ts";
import { TokenType } from "./lexer.ts";

const OPTIONAL_WHITESPACE = rep(tok(TokenType.whitespace));

const IDENTIFIER = apply(
  tok(TokenType.ident),
  (value) =>
    new AstNode({
      nodeType: AstNodeType.ident,
      token: value,
      value: value.text,
    }),
);

const ASSIGNMENT = apply(
  seq(
    IDENTIFIER,
    OPTIONAL_WHITESPACE,
    tok(TokenType.eq_operator),
    OPTIONAL_WHITESPACE,
    tok(TokenType.int_literal),
  ),
  (values) =>
    new AstNode({
      nodeType: AstNodeType.assign,
      token: values[2],
      value: values[2].text,
      children: [values[0]/* TODO: add ast node for int literal */
      ],
    }),
);
