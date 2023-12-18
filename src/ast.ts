import { Token } from "typescript-parsec";
import { AnalysisFindings, AnalysisResult } from "./analysis.ts";
import { TokenType } from "./lexer.ts";
import { SymbolValue, SymbolValueKind } from "./symbol.ts";
import { AppError } from "./util/error.ts";
import { Option, Result } from "./util/monad/index.ts";

export interface BinaryAstNode<L, R> {
  lhs: L;
  rhs: R;
}

export interface NaryAstNode<T> {
  children: T[];
}

export interface TokenAstNode<T = TokenType> {
  token: Token<T>;
}

export interface ValueAstNode<V> {
  token: Token<TokenType>;
  value: V;
}

export interface WrapperAstNode<T> {
  child: T;
}

export interface InterpretableAstNode {
  interpret(): Option<AppError>;
  check(): AnalysisFindings;
}

export interface EvaluableAstNode<R, A = SymbolValueKind> {
  evaluate(): Result<R, AppError>;
  analyze(): AnalysisResult<A>;
}

export interface AnalyzableAstNode<A> {
  analyze(): AnalysisResult<A>;
}

export type AstNode =
  | BinaryAstNode<unknown, unknown>
  | NaryAstNode<unknown>
  | ValueAstNode<unknown>
  | WrapperAstNode<unknown>
  | InterpretableAstNode
  | EvaluableAstNode<unknown>;

export type NumberAstNode =
  & ValueAstNode<number>
  & EvaluableAstNode<SymbolValue<number>>;
export type IdentifierAstNode =
  & ValueAstNode<string>
  & EvaluableAstNode<string>;
export type IdentifierExpressionAstNode =
  & WrapperAstNode<IdentifierAstNode>
  & EvaluableAstNode<SymbolValue<unknown>>
export type ExpressionAstNode =
  & EvaluableAstNode<SymbolValue<unknown>>
  & InterpretableAstNode;
export type AssignAstNode =
  & BinaryAstNode<IdentifierAstNode, ExpressionAstNode>
  & InterpretableAstNode;
export type StatementAstNode =
  | ExpressionAstNode
  | AssignAstNode;
export type StatementAstNodes =
  & NaryAstNode<StatementAstNode>
  & InterpretableAstNode;

export type AST = StatementAstNodes;
