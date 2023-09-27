import { alt, apply, seq, tok } from "typescript-parsec";
import { AstNode, AstNodeType } from "./ast.ts";
import { TokenType } from "./lexer.ts";


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
    tok(TokenType.eq_operator),
    INT_LITERAL,
  ),
  (values) =>
    new AstNode({
      nodeType: AstNodeType.assign,
      token: values[1],
      value: values[1].text,
      children: [values[0], values[2]],
    }),
);
