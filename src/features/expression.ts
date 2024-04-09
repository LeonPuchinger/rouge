import { alt_sc, apply } from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { SymbolValue } from "../symbol.ts";
import { booleanExpression } from "./boolean_expression.ts";
import { numericExpression } from "./numeric_expression.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST Nodes */

export type ExpressionAstNode =
  & EvaluableAstNode<SymbolValue<unknown>>
  & InterpretableAstNode;

/* PARSER */

export const expression = apply(
  alt_sc(
    booleanExpression,
    numericExpression,
    symbolExpression,
  ),
  (expression: EvaluableAstNode): ExpressionAstNode => ({
    ...expression,
    interpret() {
      this.evaluate();
    },
    check() {
      return this.analyze();
    },
  }),
);
