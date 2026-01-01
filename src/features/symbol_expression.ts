import {
  alt_sc,
  apply,
  kright,
  lrec,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { CompositeSymbolValue, SymbolFlags, SymbolValue } from "../symbol.ts";
import { CompositeSymbolType, IgnoreSymbolType, SymbolType } from "../type.ts";
import { InternalError } from "../util/error.ts";
import { None } from "../util/monad/index.ts";
import { ends_with_breaking_whitespace } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { configureExpression } from "./expression.ts";
import { propertyInvocation } from "./invocation.ts";
import { chainedAccess, referenceExpression } from "./parser_declarations.ts";

/* AST NODES */

export class ReferenceExpressionAstNode implements EvaluableAstNode {
  identifierToken: Token<TokenKind>;

  constructor(identifier: Token<TokenKind>) {
    this.identifierToken = identifier;
  }

  evaluate(environment: ExecutionEnvironment): SymbolValue<unknown> {
    const ident = this.identifierToken.text;
    return environment.runtimeTable
      .findSymbol(ident)
      .map(([symbol, _flags]) => symbol.value)
      .unwrapOrThrow(
        new InternalError(
          `Unable to resolve symbol ${ident} in the symbol table.`,
          "This should have been caught during static analysis.",
        ),
      );
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const ident = this.identifierToken.text;
    const findings = AnalysisFindings.empty();
    environment.analysisTable.findSymbol(ident).onNone(() => {
      findings.errors.push(
        AnalysisError(environment, {
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

  resolveType(environment: ExecutionEnvironment): SymbolType {
    return environment.analysisTable
      .findSymbol(this.identifierToken.text)
      .map(([symbol, _flags]) => symbol.valueType)
      .or(
        environment.runtimeTable.findSymbol(this.identifierToken.text)
          .map(([symbol, _flags]) => symbol.value.valueType),
      )
      .unwrapOrThrow(
        new InternalError(
          "Unable to resolve a symbol in the symbol table.",
          "This should have been caught by static analysis.",
        ),
      );
  }

  resolveFlags(
    environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return environment.analysisTable
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

  evaluate(environment: ExecutionEnvironment): SymbolValue<unknown> {
    const parentValue = this.parent.evaluate(
      environment,
    ) as CompositeSymbolValue;
    const accessedValue = parentValue.value.get(this.identifierToken.text);
    if (accessedValue === undefined) {
      throw new InternalError(
        `The property "${this.identifierToken.text}" does not exist on the object.`,
        "This should have been caught during static analysis.",
      );
    }
    return accessedValue;
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    const findings = this.parent.analyze(environment);
    if (findings.isErroneous()) {
      return findings;
    }
    const parentType = this.parent.resolveType(environment).peel();
    if (parentType instanceof IgnoreSymbolType) {
      return findings;
    }
    if (parentType instanceof CompositeSymbolType) {
      const fieldExists = parentType.fields.has(this.identifierToken.text);
      if (fieldExists) {
        return findings;
      }
    }
    findings.errors.push(
      AnalysisError(environment, {
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

  resolveType(environment: ExecutionEnvironment): SymbolType {
    const parentType = this.parent
      .resolveType(environment)
      .peel() as CompositeSymbolType;
    if (parentType instanceof IgnoreSymbolType) {
      return parentType;
    }
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

  resolveFlags(
    _environment: ExecutionEnvironment,
  ): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.identifierToken, this.identifierToken];
  }
}

/* PARSER */

referenceExpression.setPattern(
  apply(
    tok(TokenKind.ident),
    (identifier) => new ReferenceExpressionAstNode(identifier),
  ),
);

export const propertyAccess = apply(
  kright(
    ends_with_breaking_whitespace(str<TokenKind>(".")),
    tok(TokenKind.ident),
  ),
  (identifier) => {
    return (parent: EvaluableAstNode) =>
      new PropertyAccessAstNode({ identifierToken: identifier, parent });
  },
);

const postfix = alt_sc(
  propertyInvocation,
  propertyAccess,
);

chainedAccess.setPattern(
  lrec(
    configureExpression({
      includeChainedAccess: false,
    }),
    postfix,
    (parent: EvaluableAstNode, postfixFn) => {
      return postfixFn(parent);
    },
  ),
);
