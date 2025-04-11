import { apply, kright, rep_sc, seq, str, tok, Token } from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  CompositeSymbolValue,
  runtimeTable,
  SymbolFlags,
  SymbolValue,
} from "../symbol.ts";
import { CompositeSymbolType, SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";
import {
  ends_with_breaking_whitespace,
  starts_with_breaking_whitespace,
} from "../util/parser.ts";
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

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return analysisTable
      .findSymbol(this.identifierToken.text)
      .map(([_symbol, flags]) =>
        new Map(Object.entries(flags)) as Map<keyof SymbolFlags, boolean>
      )
      .unwrapOr(new Map());
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.identifierToken, this.identifierToken];
  }
}

export class PropertyAccessAstNode implements EvaluableAstNode {
  identifierToken!: Token<TokenKind>;
  parent!: EvaluableAstNode;

  constructor(params: Attributes<PropertyAccessAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): SymbolValue<unknown> {
    const parentValue = this.parent.evaluate() as CompositeSymbolValue;
    const accessedValue = parentValue.value.get(this.identifierToken.text);
    if (accessedValue === undefined) {
      throw new InternalError(
        `The property "${this.identifierToken.text}" does not exist on the object.`,
        "This should have been caught during static analysis.",
      );
    }
    return accessedValue;
  }

  analyze(): AnalysisFindings {
    const findings = this.parent.analyze();
    if (findings.isErroneous()) {
      return findings;
    }
    const parentType = this.parent.resolveType().peel();
    if (parentType instanceof CompositeSymbolType) {
      const fieldExists = parentType.fields.has(this.identifierToken.text);
      if (fieldExists) {
        return findings;
      }
    }
    findings.errors.push(
      AnalysisError({
        message:
          "The property you tried to access does not exist on the object.",
        beginHighlight: this,
        endHighlight: None(),
        messageHighlight:
          `Type "${parentType.displayName()}" does not include an attibute called "${this.identifierToken.text}".`,
      }),
    );
    return findings;
  }

  resolveType(): SymbolType {
    const parentType = this.parent
      .resolveType()
      .peel() as CompositeSymbolType;
    const accessedType = parentType.fields.get(
      this.identifierToken.text,
    );
    if (accessedType === undefined) {
      throw new InternalError(
        `The property "${this.identifierToken.text}" does not exist on the object.`,
        "This should have been caught during static analysis.",
      );
    }
    return accessedType;
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.identifierToken, this.identifierToken];
  }
}

/* PARSER */

export const propertyAccess = kright(
  ends_with_breaking_whitespace(str<TokenKind>(".")),
  tok(TokenKind.ident),
);

export const referenceExpression = apply(
  tok(TokenKind.ident),
  (identifier) => new ReferenceExpressionAstNode(identifier),
);

export const symbolExpression = apply(
  seq(
    referenceExpression,
    rep_sc(
      starts_with_breaking_whitespace(
        propertyAccess,
      ),
    ),
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
