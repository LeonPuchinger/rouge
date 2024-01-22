import { Token } from "typescript-parsec";
import { AnalysisFindings, AnalysisResult } from "./analysis.ts";
import { TokenType } from "./lexer.ts";
import { SymbolValue, SymbolValueKind } from "./symbol.ts";
import { AppError } from "./util/error.ts";
import { Option, Result } from "./util/monad/index.ts";

export interface BinaryAstNode<L extends AstNode, R extends AstNode> {
  lhs: L;
  rhs: R;
}

export interface NaryAstNode<T extends AstNode> {
  children: T[];
}

export interface TokenAstNode<T = TokenType> {
  token: Token<T>;
}

export interface ValueAstNode<V> extends TokenAstNode {
  value: V;
}

export interface WrapperAstNode<T extends AstNode> {
  child: T;
}

export interface InterpretableAstNode {
  interpret(): Option<AppError>;
  check(): AnalysisFindings;
}

export interface EvaluableAstNode<R = SymbolValue<unknown>, A = SymbolValueKind> {
  evaluate(): Result<R, AppError>;
  analyze(): AnalysisResult<A>;
}

export interface AnalyzableAstNode<A> {
  analyze(): AnalysisResult<A>;
}

export type AstNode =
  | BinaryAstNode<AstNode, AstNode>
  | NaryAstNode<AstNode>
  | TokenAstNode
  | ValueAstNode<unknown>
  | WrapperAstNode<AstNode>
  | InterpretableAstNode
  | EvaluableAstNode<unknown>;

export type ExpressionAstNode =
  & EvaluableAstNode<SymbolValue<unknown>>
  & InterpretableAstNode;
export type AssignAstNode =
  & TokenAstNode
  & WrapperAstNode<ExpressionAstNode>
  & InterpretableAstNode;
export type StatementAstNode =
  | ExpressionAstNode
  | AssignAstNode;
export type StatementAstNodes =
  & NaryAstNode<StatementAstNode>
  & InterpretableAstNode;

export type AST = StatementAstNodes;
