import { Token } from "typescript-parsec";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { SymbolType, SymbolValue } from "./symbol.ts";

export interface AstNode {
  analyze(): AnalysisFindings;
  tokenRange(): [Token<TokenKind>, Token<TokenKind>];
}

export interface EvaluableAstNode<R = SymbolValue<unknown>> extends AstNode {
  evaluate(): R;
  resolveType(): SymbolType;
}

export interface InterpretableAstNode extends AstNode {
  interpret(): void;
}

export type AST = StatementsAstNode;
