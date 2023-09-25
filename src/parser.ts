import { apply, rep, seq, tok } from "typescript-parsec";
import { AstNode, AstNodeType } from "./ast.ts";
import { TokenType } from "./lexer.ts";

const OPTIONAL_WHITESPACE = rep(tok(TokenType.whitespace));

const ASSIGNMENT = apply(
  seq(
    tok(TokenType.ident),
    OPTIONAL_WHITESPACE,
    tok(TokenType.eq_operator),
    OPTIONAL_WHITESPACE,
    tok(TokenType.int_literal),
  ),
  (value) => {
    return new AstNode(AstNodeType.assign, []); // TODO: construct AST node children
  },
);
