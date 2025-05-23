import {
  alt_sc,
  apply,
  kright,
  list_sc,
  opt_sc,
  rule,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { EvaluableAstNode } from "../ast.ts";
import { ExecutionEnvironment } from "../execution.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolFlags } from "../symbol.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
  SymbolType,
} from "../type.ts";
import { Option, Some } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import {
  opt_sc_default,
  starts_with_breaking_whitespace,
  surround_with_breaking_whitespace,
} from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { nothingType, WithOptionalAttributes } from "../util/type.ts";

/* AST NODES */

export type TypeLiteralAstNode =
  | FunctionTypeLiteralAstNode
  | CompositeTypeLiteralAstNode;

export class FunctionTypeLiteralAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  parameters!: TypeLiteralAstNode[];
  returnType!: Option<TypeLiteralAstNode>;
  closingParenthesis!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<FunctionTypeLiteralAstNode>) {
    Object.assign(this, params);
    this.returnType = Some(params.returnType);
    this.closingParenthesis = Some(params.closingParenthesis);
  }

  resolveType(environment: ExecutionEnvironment): SymbolType {
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType(environment)
    );
    const returnType = this.returnType.map((node) =>
      node.resolveType(environment)
    )
      .unwrapOr(nothingType(environment));
    return new FunctionSymbolType({
      parameterTypes: parameterTypes,
      returnType: returnType,
    });
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    this.returnType.then((type) => {
      findings = AnalysisFindings.merge(findings, type.analyze(environment));
    });
    for (const parameter of this.parameters) {
      findings = AnalysisFindings.merge(
        findings,
        parameter.analyze(environment),
      );
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [
      this.name,
      this.returnType
        .map((type) => type.tokenRange()[1])
        .unwrapOr(
          this.closingParenthesis.unwrapOr(this.name),
        ),
    ];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

export class CompositeTypeLiteralAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  placeholders!: TypeLiteralAstNode[];
  closingBracket!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<CompositeTypeLiteralAstNode>) {
    Object.assign(this, params);
    this.closingBracket = Some(params.closingBracket);
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    const type = environment.typeTable.findType(this.name.text)
      .map(([type, _flags]) => type as CompositeSymbolType);
    if (!type.hasValue()) {
      findings.errors.push(AnalysisError(environment, {
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
        message: `The type called '${this.name.text}' could not be found.`,
        messageHighlight: "",
      }));
      return findings;
    }
    for (const placeholder of this.placeholders) {
      findings = AnalysisFindings.merge(
        findings,
        placeholder.analyze(environment),
      );
    }
    if (findings.isErroneous()) {
      return findings;
    }
    const requiredPlaceholders = type
      .map((type) => type.placeholders?.size ?? 0)
      .unwrapOr(0);
    const suppliedPlaceholders = this.placeholders.length;
    if (requiredPlaceholders !== suppliedPlaceholders) {
      findings.errors.push(AnalysisError(environment, {
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
        message:
          `The type '${this.name.text}' expected ${requiredPlaceholders} placeholders but ${suppliedPlaceholders} were supplied.`,
        messageHighlight: "",
      }));
    }
    return findings;
  }

  resolveType(environment: ExecutionEnvironment): CompositeSymbolType {
    const placeholderTypes = this.placeholders
      .map((placeholder) => placeholder.resolveType(environment));
    let resolvedType = environment.typeTable
      .findType(this.name.text)
      .map(([type, _flags]) => type)
      .unwrap() as CompositeSymbolType;
    if (placeholderTypes.length !== 0) {
      /* Only fork the type in case it can be modified by parameterizing it with placeholders
      (e.g. types that don't allow placeholders or placeholders themselves).
      The same placeholders often appear in multiple places, but have to be bound via
      the same reference. This behavior ensures that placeholders are not unnecessarily
      forked, breaking the reference to the original instance.
      Example:

      ```type Bar<T> {
        foo: T;
      }```

      This type definition results in a `CompositeSymbolType` with a placeholder.
      `CompositeSymbolType`s keep a list of the placeholders that are used in the type so they
      can be bound positionally. When the type literal `T` for the field `foo` is resolved and forked,
      the placeholder stored in the `CompositeSymbolType` is not the same reference anymore as the type stored
      for the field `foo`. When `T` is bound globally for the type `Bar`, the type for `foo` is not updated
      accordingly anymore. Therefore, in case a type literal is not parametrized with placeholders, it
      should not be forked. */
      resolvedType = resolvedType.fork();
    }
    // positionally bind placeholders to the supplied types
    for (let i = 0; i < placeholderTypes.length; i++) {
      Array.from(resolvedType.placeholders.values())[i].bind(
        placeholderTypes[i],
      );
    }
    return resolvedType;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingBracket.unwrapOr(this.name)];
  }

  resolveFlags(): Map<keyof SymbolFlags, boolean> {
    return new Map();
  }
}

/* PARSER */

export const typeLiteral = rule<TokenKind, TypeLiteralAstNode>();

const typeLiterals = apply(
  opt_sc(
    list_sc(
      typeLiteral,
      surround_with_breaking_whitespace(str(",")),
    ),
  ),
  (literals) => literals ?? [],
);

export const compositeTypeLiteral = apply(
  seq(
    tok(TokenKind.ident),
    opt_sc_default<
      [
        Token<TokenKind> | undefined,
        TypeLiteralAstNode[],
        Token<TokenKind> | undefined,
      ]
    >(
      seq(
        surround_with_breaking_whitespace(str("<")),
        typeLiterals,
        starts_with_breaking_whitespace(str(">")),
      ),
      [undefined, [], undefined],
    ),
  ),
  ([name, [_openingBracket, placeholders, closingBracket]]) =>
    new CompositeTypeLiteralAstNode({
      name: name,
      placeholders: placeholders,
      closingBracket: closingBracket,
    }),
);

export const functionTypeLiteral = apply(
  seq(
    str<TokenKind>("Function"),
    opt_sc_default<
      [
        Token<TokenKind> | undefined,
        TypeLiteralAstNode[],
        Token<TokenKind> | undefined,
      ]
    >(
      seq(
        surround_with_breaking_whitespace(str("(")),
        typeLiterals,
        starts_with_breaking_whitespace(str(")")),
      ),
      [undefined, [], undefined],
    ),
    opt_sc(
      kright(
        surround_with_breaking_whitespace(str("->")),
        typeLiteral,
      ),
    ),
  ),
  (
    [
      keyword,
      [_openingParenthesis, parameterList, closingParenthesis],
      returnType,
    ],
  ) =>
    new FunctionTypeLiteralAstNode({
      name: keyword,
      parameters: parameterList ?? [],
      returnType: returnType,
      closingParenthesis: closingParenthesis,
    }),
);

typeLiteral.setPattern(
  alt_sc(
    functionTypeLiteral,
    compositeTypeLiteral,
  ),
);
