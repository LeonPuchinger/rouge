import { apply, tok } from "typescript-parsec";
import { analysisTable } from "../analysis.ts";
import { EvaluableAstNode, TokenAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { runtimeTable } from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { SymbolValue } from "../symbol.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";

/* Identifier expression */

export type SymbolExpressionAstNode =
  & TokenAstNode
  & EvaluableAstNode<SymbolValue<unknown>>;

export function evaluateSymbolExpression(
  node: SymbolExpressionAstNode,
): SymbolValue<unknown> {
  const ident = node.token.text;
  return runtimeTable
    .findSymbol(ident)
    .map((symbol) => symbol.value)
    .unwrapOrThrow(
      new InternalError(
        `Unable to resolve symbol ${ident} in the symbol table.`,
        "This should have been caught during static analysis.",
      ),
    );
}

export function analyzeSymbolExpression(
  node: SymbolExpressionAstNode,
): AnalysisFindings {
  const ident = node.token.text;
  const findings = AnalysisFindings.empty();
  analysisTable.findSymbol(ident).onNone(() => {
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

export const symbolExpression = apply(
  tok(TokenType.ident),
  (identifier): SymbolExpressionAstNode => ({
    token: identifier,
    evaluate() {
      return evaluateSymbolExpression(this);
    },
    analyze() {
      return analyzeSymbolExpression(this);
    },
    resolveType() {
      return analysisTable
        .findSymbol(this.token.text)
        .map((symbol) => symbol.valueKind)
        .unwrapOrThrow(
          new InternalError(
            "Unable to resolve a symbol in the symbol table.",
            "This should have been caught by static analysis.",
          ),
        );
    },
  }),
);
