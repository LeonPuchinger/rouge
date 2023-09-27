import { Token } from "typescript-parsec";
import { TokenType } from "./lexer.ts";

export enum AstNodeType {
  assign,
  ident,
  int_literal,
}

export interface AstNodeParams {
  nodeType: AstNodeType;
  token: Token<TokenType>;
  value: number | string;
  children?: Array<AstNode>;
}

export class AstNode {
  nodeType: AstNodeType;
  token: Token<TokenType>;
  value: number | string;
  children: Array<AstNode>;

  constructor(params: AstNodeParams) {
    this.nodeType = params.nodeType;
    this.token = params.token;
    this.value = params.value;
    this.children = params.children ?? [];
  }

  addChild(child: AstNode) {
    this.children.push(child);
  }
}
