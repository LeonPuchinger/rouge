import { apply, kright, rep_sc, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { analysisTable, runtimeTable, SymbolValue } from "../symbol.ts";
import { SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

export class ReferenceExpressionAstNode implements EvaluableAstNode {
  identifierToken: Token<TokenKind>;

  constructor(identifier: Token<TokenKind>) {
    this.identifierToken = identifier;
  }

  evaluate(): SymbolValue<unknown> {
    const ident = this.identifierToken.text;
    return runtimeTable
      .findSymbol(ident)
      .map(([symbol, _flags]) => symbol.value)
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
      .map(([symbol, _flags]) => symbol.valueType)
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

class PropertyAccessAstNode implements EvaluableAstNode {
  identifierToken!: Token<TokenKind>;
  parent!: EvaluableAstNode;

  constructor(params: Attributes<PropertyAccessAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): SymbolValue<unknown> {
    const ident = this.identifierToken.text;
    return runtimeTable
      .findSymbol(ident)
      .map(([symbol, _flags]) => symbol.value)
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
      .map(([symbol, _flags]) => symbol.valueType)
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

const propertyAccess = kright(
  str<TokenKind>("."),
  tok(TokenKind.ident),
);

const referenceExpression = apply(
  tok(TokenKind.ident),
  (identifier) => new ReferenceExpressionAstNode(identifier),
);

export const symbolExpression = apply(
  seq(
    referenceExpression,
    rep_sc(propertyAccess),
  ),
  ([rootSymbol, propertyAccesses]) => {
    return propertyAccesses.reduce(
      (parent, property) =>
        new PropertyAccessAstNode({
          identifierToken: property,
          parent,
        }),
      rootSymbol,
    );
  },
);
