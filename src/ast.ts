import { Token } from "typescript-parsec";
import { TokenType } from "./lexer.ts";
import { SymbolValue, SymbolValueKind } from "./symbol.ts";
import { AppError } from "./util/error.ts";
import { Option, Result } from "./util/monad/index.ts";

interface BinaryAstNode<L, R> {
  lhs: L;
  rhs: R;
}

interface NaryAstNode<T> {
  children: T[];
}

export interface ValueAstNode<V> {
  token: Token<TokenType>;
  value: V;
}

interface WrapperAstNode<T> {
  child: T;
}

interface InterpretableAstNode {
  interpret(): Option<AppError>;
}

interface EvaluableAstNode<R> {
  evaluate(): Result<R, AppError>;
}

interface CheckableAstNode {
  check(): Option<AppError>;
}

interface AnalyzableAstNode<A> {
  analyze(): Result<A, AppError>;
}

export type AstNode =
  | BinaryAstNode<unknown, unknown>
  | NaryAstNode<unknown>
  | ValueAstNode<unknown>
  | WrapperAstNode<unknown>
  | InterpretableAstNode
  | EvaluableAstNode<unknown>
  | CheckableAstNode
  | AnalyzableAstNode<unknown>;

export type IntegerAstNode =
  & ValueAstNode<number>
  & EvaluableAstNode<SymbolValue<number>>
  & AnalyzableAstNode<SymbolValueKind>;
export type IdentifierAstNode =
  & ValueAstNode<string>
  & EvaluableAstNode<string>;
export type IdentifierExpressionAstNode =
  & WrapperAstNode<IdentifierAstNode>
  & EvaluableAstNode<SymbolValue<unknown>>
  & AnalyzableAstNode<SymbolValueKind>;
export type ExpressionAstNode =
  & EvaluableAstNode<SymbolValue<unknown>>
  & InterpretableAstNode;
export type AssignAstNode =
  & BinaryAstNode<IdentifierAstNode, ExpressionAstNode>
  & InterpretableAstNode
  & CheckableAstNode;
export type StatementAstNode =
  | ExpressionAstNode
  | AssignAstNode;
export type StatementAstNodes =
  & NaryAstNode<StatementAstNode>
  & InterpretableAstNode;

export type AST = StatementAstNodes;
