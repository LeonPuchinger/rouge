import { apply, fail, Parser, Token } from "typescript-parsec";
import { EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolFlags, SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { alt_longest_var } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import {
  booleanExpression,
  chainedAccess,
  complexStringLiteral,
  functionDefinition,
  invocation,
  numericExpression,
  referenceExpression,
} from "./parser_declarations.ts";

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

  get_representation(environment: ExecutionEnvironment): string {
    const value = this.child.evaluate(environment);
    return value.representation();
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
  includeReferenceExpression?: boolean;
  includeChainedAccess?: boolean;
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
  includeReferenceExpression = true,
  includeChainedAccess = true,
  includeFunctionDefinition = true,
}: ExpressionOptions): Parser<TokenKind, ExpressionAstNode> {
  const enabledParsers = (<[Parser<TokenKind, EvaluableAstNode>, boolean][]> [
    [invocation, includeInvocation],
    [booleanExpression, includeBooleanExpression],
    [numericExpression, includeNumericExpression],
    [complexStringLiteral, includeComplexStringLiteral],
    [referenceExpression, includeReferenceExpression],
    [chainedAccess, includeChainedAccess],
    [functionDefinition, includeFunctionDefinition],
  ]).filter(([_, enabled]) => enabled)
    .map(([parser, _]) => parser);

  if (enabledParsers.length === 0) {
    throw new Error(
      "At least one expression type must be enabled when configuring an expression parser.",
    );
  }
  if (enabledParsers.length === 1) {
    return enabledParsers.at(0)! as Parser<TokenKind, ExpressionAstNode>;
  }

  const activeTokens = new Set<Token<TokenKind>>();

  return {
    parse(token: Token<TokenKind>) {
      if (!token) {
        return fail("EOF").parse(token);
      }

      // Prevent infinite recursion due to left-recursive grammars by
      // detecting re-entry at the same token without consumption.
      if (activeTokens.has(token)) {
        return fail(
          `Expression parser reached recursion limit when called with token "${token.text}".`,
        ).parse(token);
      }
      activeTokens.add(token);

      try {
        return apply(
          alt_longest_var(...enabledParsers),
          (expression: EvaluableAstNode) =>
            new ExpressionAstNode({ child: expression }),
        ).parse(token);
      } finally {
        // Ensure backtracking/other alternatives can proceed
        activeTokens.delete(token);
      }
    },
  };
}

export const expression = configureExpression({});
