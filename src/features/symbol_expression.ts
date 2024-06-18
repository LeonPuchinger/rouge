import { apply, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { analysisTable, runtimeTable, SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";

/* AST NODES */

export class SymbolExpressionAstNode implements EvaluableAstNode {
  identifierToken: Token<TokenKind>;

  constructor(identifier: Token<TokenKind>) {
    this.identifierToken = identifier;
  }

  evaluate(): SymbolValue<unknown> {
    const ident = this.identifierToken.text;
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

  analyze(): AnalysisFindings {
    const ident = this.identifierToken.text;
    const findings = AnalysisFindings.empty();
    analysisTable.findSymbol(ident).onNone(() => {
      findings.errors.push(
        AnalysisError({
          message:
            "You tried to use a variable that has not been defined at this point in the program.",
          beginHighlight: this,
          endHighlight: None(),
          messageHighlight: `Variable "${ident}" is unknown at this point.`,
        }),
      );
    });
    return findings;
  }

  resolveType(): SymbolType {
    return analysisTable
      .findSymbol(this.identifierToken.text)
      .map((symbol) => symbol.valueType)
      .unwrapOrThrow(
        new InternalError(
          "Unable to resolve a symbol in the symbol table.",
          "This should have been caught by static analysis.",
        ),
      );
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.identifierToken, this.identifierToken];
  }
}

/* PARSER */

export const symbolExpression = apply(
  tok(TokenKind.ident),
  (identifier) => new SymbolExpressionAstNode(identifier),
);
