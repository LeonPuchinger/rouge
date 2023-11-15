import { Token } from "typescript-parsec";
import { TokenType } from "./lexer.ts";
import { SymbolValue } from "./symbol.ts";
import { AppError } from "./util/error.ts";
import { Option, Result } from "./util/monad/index.ts";

interface BinaryAstNode<L, R> {
  lhs: L;
  rhs: R;
}

interface NaryAstNode<T> {
  children: T[];
}

interface ValueAstNode<V> {
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

export type AstNode =
  | BinaryAstNode<unknown, unknown>
  | NaryAstNode<unknown>
  | ValueAstNode<unknown>
  | WrapperAstNode<unknown>
  | InterpretableAstNode
  | EvaluableAstNode<unknown>;

export type IntegerAstNode =
  & ValueAstNode<number>
  & EvaluableAstNode<SymbolValue<number>>;
export type IdentifierAstNode =
  & ValueAstNode<string>
  & EvaluableAstNode<string>;
export type ExpressionAstNode =
  & WrapperAstNode<EvaluableAstNode<SymbolValue<unknown>> | IdentifierAstNode>
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
