import { Token } from "typescript-parsec";
import { StatementsAstNode } from "./features/statement.ts";
import { AnalysisFindings } from "./finding.ts";
import { TokenKind } from "./lexer.ts";
import { SymbolFlags, SymbolValue } from "./symbol.ts";
import { SymbolType } from "./type.ts";

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
export interface EvaluableAstNode<R = SymbolValue<unknown>, S = SymbolType>
  extends AstNode {
  /**
   * Executes the content of the AST node while yielding a result.
   */
  evaluate(): R;

  /**
   * Returns the corresponding `SymbolType` of the evaluated result.
   * Before this method can be called, it has to be made sure
   * that `analyze` is called first on the AST node and its result is inspected.
   * Static analysis should catch any errors in regards to type resolving (e.g. the type does not exist).
   * Even though implementations of `resolveType` can assume that `analyze` has been called already,
   * an `InternalError` should still be thrown in case `analyze` has not been called and type resolving fails.
   */
  resolveType(): S;

  /**
   * Returns symbol flags associated with the evaluated symbol.
   * Flags are usually stored in the symbol table. In case process of evaluating the AST node
   * does not involve querying the symbol table, the returned flags will likely be empty.
   */
  resolveFlags(): Map<keyof SymbolFlags, boolean>;
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
