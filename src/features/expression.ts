import { alt_sc, apply, Token } from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolType, SymbolValue } from "../symbol.ts";
import { Attributes } from "../util/type.ts";
import { booleanExpression } from "./boolean_expression.ts";
import { numericExpression } from "./numeric_expression.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST Nodes */

export class ExpressionAstNode
  implements EvaluableAstNode, InterpretableAstNode {
  child!: EvaluableAstNode;

  constructor(params: Attributes<ExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    return this.child.analyze();
  }

  evaluate(): SymbolValue<unknown> {
    return this.child.evaluate();
  }

  interpret(): void {
    this.child.evaluate();
  }

  resolveType(): SymbolType {
    return this.child.resolveType();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return this.child.tokenRange();
  }
}

/* PARSER */

export const expression = apply(
  alt_sc(
    booleanExpression,
    numericExpression,
    symbolExpression,
  ),
  (expression: EvaluableAstNode) =>
    new ExpressionAstNode({ child: expression }),
);
