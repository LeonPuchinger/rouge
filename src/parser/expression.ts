import { apply, tok } from "typescript-parsec";
import { AnalysisResult, analysisTable } from "../analysis.ts";
import { EvaluableAstNode, TokenAstNode } from "../ast.ts";
import { AnalysisError } from "../finding.ts";
import { runtimeTable } from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue, SymbolValueKind } from "../symbol.ts";
import { AppError, InternalError } from "../util/error.ts";
import { None, Result } from "../util/monad/index.ts";

/* Identifier expression */

export type IdentifierExpressionAstNode =
  & TokenAstNode
  & EvaluableAstNode<SymbolValue<unknown>>;

export function evaluateIdentifierExpression(
  node: IdentifierExpressionAstNode,
): Result<SymbolValue<unknown>, AppError> {
  const ident = node.token.text;
  return runtimeTable.findSymbol(ident).ok_or(
    InternalError(
      `Unable to resolve symbol ${ident}.`,
      "This should have been caught during static analysis.",
    ),
  ).map((symbol) => symbol.value);
}

export function analyzeIdentifierExpression(
  node: IdentifierExpressionAstNode,
): AnalysisResult<SymbolValueKind> {
  const ident = node.token.text;
  const findings: AnalysisResult<SymbolValueKind> = {
    value: analysisTable.findSymbol(ident)
      .map((symbol) => symbol.valueKind),
    warnings: [],
    errors: [],
  };
  findings.value.onNone(() => {
    findings.errors.push(
      AnalysisError({
        message:
          "You tried to use a variable that has not been defined at this point in the program.",
        beginHighlight: node,
        endHighlight: None(),
        messageHighlight: `Variable "${ident}" is unknown at this point.`,
      }),
    );
  });
  return findings;
}

export const identifierExpression = apply(
  tok(TokenType.ident),
  (identifier): IdentifierExpressionAstNode => ({
    token: identifier,
    evaluate() {
      return evaluateIdentifierExpression(this);
    },
    analyze() {
      return analyzeIdentifierExpression(this);
    },
  }),
);
