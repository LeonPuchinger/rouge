import { Token } from "typescript-parsec";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { SymbolType, SymbolValue } from "./symbol.ts";

export interface AstNode {
  analyze(): AnalysisFindings;
  //tokenRange(): [Token<TokenKind>, Token<TokenKind>];
}

export interface EvaluableAstNode<R = SymbolValue<unknown>> extends AstNode {
  evaluate(): R;
  resolveType(): SymbolType;
}

export interface InterpretableAstNode extends AstNode {
  interpret(): void;
}

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

export type AST = StatementsAstNode;
