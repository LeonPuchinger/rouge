import { Token } from "typescript-parsec";
import { TokenType } from "./lexer.ts";
import { Panic } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { Matchable } from "./util/pattern.ts";

interface BinaryAstNode<L, R> {
  lhs: L;
  rhs: R;
}

interface NaryAstNode<T> {
  children: [T];
}

interface ValueAstNode<V> {
  token: Token<TokenType>;
  value: V;
}

export type IntegerAstNode = ValueAstNode<number> & Matchable<"IntegerAstNode">;
export type IdentifierAstNode =
  & ValueAstNode<string>
  & Matchable<"IdentifierAstNode">;
export type AssignAstNode =
  & BinaryAstNode<IdentifierAstNode, IntegerAstNode>
  & Matchable<"AssignAstNode">;
export type ExpressionAstNode = AssignAstNode & Matchable<"ExpressionAstNode">;
export type ExpressionsAstNode = NaryAstNode<ExpressionAstNode>;

export type AST = ExpressionsAstNode;

export enum AstNodeType {
  assign,
  ident,
  int_literal,
  expressions,
}

export interface UncheckedAstNodeParams {
  nodeType: AstNodeType;
  token?: Token<TokenType>;
  value?: number | string;
  children?: Array<UncheckedAstNode>;
}

export class UncheckedAstNode {
  nodeType: AstNodeType;
  token: Option<Token<TokenType>>;
  value: Option<number | string>;
  children: Array<UncheckedAstNode>;

  constructor(params: UncheckedAstNodeParams) {
    this.nodeType = params.nodeType;
    this.token = (params.token !== undefined && params.token !== null)
      ? Some(params.token)
      : None();
    this.value = (params.value !== undefined && params.value !== null)
      ? Some(params.value)
      : None();
    this.children = params.children ?? [];
  }

  addChild(child: UncheckedAstNode) {
    this.children.push(child);
  }

  child(index: number): UncheckedAstNode | undefined {
    return this.children.at(index);
  }

  childOrPanic(index: number): UncheckedAstNode {
    const c = this.child(index);
    if (!c) {
      throw Panic(
        `Tried to access child of AST node at index ${index} with only ${this.children.length} children`,
      );
    }
    return c;
  }
}
