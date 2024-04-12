import { Token } from "typescript-parsec";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { SymbolType, SymbolValue } from "./symbol.ts";

/**
 * The common super type for every AST node in the interpreter.
 * However, this interface is usually not implemented directly.
 * Rather, its subtypes `EvaluableAstNode` and `InterpretableAstNode` are implemented.
 */
export interface AstNode {
  /**
   * Performs the static analysis of the AST node and yields its results.
   * This method is also responsible for gathering the analysis results of any of its
   * child AST nodes and merging them with the results of its own analysis.
   */
  analyze(): AnalysisFindings;

  /**
   * Returns a range of tokens that represent the extent of the input source code that each AST node covers.
   * This is important, for instance, when trying to generate a snippet of source code out of the AST node for an error message.
   */
  tokenRange(): [Token<TokenKind>, Token<TokenKind>];
}

/**
 * An AST node that can be executed and yield a result.
 * This type of AST node is primarily used for expressions, which evaluate to a result.
 * In rare cases, the execution can produce side effects, however most of the time, the result should just be returned.
 */
export interface EvaluableAstNode<R = SymbolValue<unknown>> extends AstNode {
  /**
   * Executes the content of the AST node while yielding a result.
   */
  evaluate(): R;

  /**
   * Returns the corresponding `SymbolType` of the evaluated result.
   */
  resolveType(): SymbolType;
}

/**
 * An AST node that can be executed but the execution does not yield a result.
 * This type of AST node is primarily used for statements, which don't evaluate to anything.
 * The execution can however still produce side effects, e.g. creating a symbol in the symbol table.
 */
export interface InterpretableAstNode extends AstNode {
  /**
   * Executes the contents of the AST node without yielding a result.
   */
  interpret(): void;
}

/**
 * Shorthand type to represent the AST through its root node.
 */
export type AST = StatementsAstNode;
