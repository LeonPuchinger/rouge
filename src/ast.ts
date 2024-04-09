import { Token } from "typescript-parsec";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { SymbolType, SymbolValue } from "./symbol.ts";

export interface BinaryAstNode<L extends AstNode, R extends AstNode> {
  lhs: L;
  rhs: R;
}

export interface NaryAstNode<T extends AstNode> {
  children: T[];
}

export interface TokenAstNode<T = TokenKind> {
  token: Token<T>;
}

export interface ValueAstNode<V> extends TokenAstNode {
  value: V;
}

export interface WrapperAstNode<T extends AstNode> {
  child: T;
}

export interface InterpretableAstNode {
  interpret(): void;
  // TODO: rename to analyze as there is no difference anymore
  check(): AnalysisFindings;
}

export interface EvaluableAstNode<R = SymbolValue<unknown>, A = SymbolType> {
  analyze(): AnalysisFindings;
  evaluate(): R;
  resolveType(): A;
}

export type AstNode =
  | BinaryAstNode<AstNode, AstNode>
  | NaryAstNode<AstNode>
  | TokenAstNode
  | ValueAstNode<unknown>
  | WrapperAstNode<AstNode>
  | InterpretableAstNode
  | EvaluableAstNode<unknown>;

export type AST = StatementsAstNode;
