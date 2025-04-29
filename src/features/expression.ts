import { apply, Parser, Token } from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolFlags, SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { alt_sc_var } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { booleanExpression } from "./boolean_expression.ts";
import { numericExpression } from "./numeric_expression.ts";
import {
  complexStringLiteral,
  functionDefinition,
  invocation,
} from "./parser_declarations.ts";
import { symbolExpression } from "./symbol_expression.ts";

/* AST NODES */

export class ExpressionAstNode
  implements EvaluableAstNode, InterpretableAstNode {
  child!: EvaluableAstNode;

  constructor(params: Attributes<ExpressionAstNode>) {
    Object.assign(this, params);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    return this.child.analyze(environment);
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<unknown> {
    return this.child.evaluate(environment);
  }

  interpret(environment: ExecutionEnvironment): void {
    this.child.evaluate(environment);
  }

  resolveType(environment: ExecutionEnvironment): SymbolType {
    return this.child.resolveType(environment);
  }

  resolveFlags(
    environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return this.child.resolveFlags(environment);
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return this.child.tokenRange();
  }
}

/* PARSER */

type ExpressionOptions = {
  includeInvocation?: boolean;
  includeBooleanExpression?: boolean;
  includeNumericExpression?: boolean;
  includeComplexStringLiteral?: boolean;
  includeSymbolExpression?: boolean;
  includeFunctionDefinition?: boolean;
};

/**
 * Builds a parser for expressions, but allows the
 * user to disable certain kinds of expressions.
 */
export function configureExpression({
  includeInvocation = true,
  includeBooleanExpression = true,
  includeNumericExpression = true,
  includeComplexStringLiteral = true,
  includeSymbolExpression = true,
  includeFunctionDefinition = true,
}: ExpressionOptions): Parser<TokenKind, ExpressionAstNode> {
  const enabledParsers = (<[Parser<TokenKind, EvaluableAstNode>, boolean][]> [
    [invocation, includeInvocation],
    [booleanExpression, includeBooleanExpression],
    [numericExpression, includeNumericExpression],
    [complexStringLiteral, includeComplexStringLiteral],
    [symbolExpression, includeSymbolExpression],
    [functionDefinition, includeFunctionDefinition],
  ]).filter(([_, enabled]) => enabled)
    .map(([parser, _]) => parser);

  return apply(
    alt_sc_var(...enabledParsers),
    (expression: EvaluableAstNode) =>
      new ExpressionAstNode({ child: expression }),
  );
}

export const expression = configureExpression({});
