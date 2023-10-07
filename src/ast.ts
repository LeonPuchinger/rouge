import { Token } from "typescript-parsec";
import { TokenType } from "./lexer.ts";
import { None, Option, Some } from "./util/monad.ts";

export enum AstNodeType {
  assign,
  ident,
  int_literal,
  expressions,
}

export interface AstNodeParams {
  nodeType: AstNodeType;
  token?: Token<TokenType>;
  value?: number | string;
  children?: Array<AstNode>;
}

export class AstNode {
  nodeType: AstNodeType;
  token: Option<Token<TokenType>>;
  value: Option<number | string>;
  children: Array<AstNode>;

  constructor(params: AstNodeParams) {
    this.nodeType = params.nodeType;
    this.token = (params.token !== undefined && params.token !== null)
      ? Some(params.token)
      : None();
    this.value = (params.value !== undefined && params.value !== null)
      ? Some(params.value)
      : None();
    this.children = params.children ?? [];
  }

  addChild(child: AstNode) {
    this.children.push(child);
  }

  child(index: number): AstNode | undefined {
    return this.children.at(index);
  } 
}
