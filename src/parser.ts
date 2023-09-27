import { apply, rep, seq, tok } from "typescript-parsec";
import { AstNode, AstNodeType } from "./ast.ts";
import { TokenType } from "./lexer.ts";

const OPTIONAL_WHITESPACE = rep(tok(TokenType.whitespace));

const IDENTIFIER = apply(
  tok(TokenType.ident),
  (token) =>
    new AstNode({
      nodeType: AstNodeType.ident,
      token: token,
      value: token.text,
    }),
);

const INT_LITERAL = apply(
  tok(TokenType.int_literal),
  (token) =>
    new AstNode({
      nodeType: AstNodeType.int_literal,
      token: token,
      value: parseInt(token.text),
    }),
);

const ASSIGNMENT = apply(
  seq(
    IDENTIFIER,
    OPTIONAL_WHITESPACE,
    tok(TokenType.eq_operator),
    OPTIONAL_WHITESPACE,
    INT_LITERAL,
  ),
  (values) =>
    new AstNode({
      nodeType: AstNodeType.assign,
      token: values[2],
      value: values[2].text,
      children: [values[0], values[4]],
    }),
);
