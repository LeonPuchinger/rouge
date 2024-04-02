import { apply, tok, Token } from "typescript-parsec";
import { analysisTable } from "../analysis.ts";
import { EvaluableAstNode, TokenAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { runtimeTable } from "../interpreter.ts";
import { TokenType } from "../lexer.ts";
import { SymbolType, SymbolValue } from "../symbol.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";

/* AST Nodes */

export class SymbolExpressionAstNode implements TokenAstNode, EvaluableAstNode {
  token: Token<TokenType>;

  constructor(identifier: Token<TokenType>) {
    this.token = identifier;
  }

  evaluate(): SymbolValue<unknown> {
    const ident = this.token.text;
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
    const ident = this.token.text;
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
      .findSymbol(this.token.text)
      .map((symbol) => symbol.valueKind)
      .unwrapOrThrow(
        new InternalError(
          "Unable to resolve a symbol in the symbol table.",
          "This should have been caught by static analysis.",
        ),
      );
  }
}

/* PARSER */

export const symbolExpression = apply(
  tok(TokenType.ident),
  (identifier) => new SymbolExpressionAstNode(identifier),
);
