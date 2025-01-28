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
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { FunctionSymbolType, SymbolType, typeTable } from "../type.ts";
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

  resolveType(): SymbolType {
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType()
    );
    const returnType = this.returnType.map((node) => node.resolveType())
      .unwrapOr(nothingType);
    return new FunctionSymbolType({
      parameterTypes: parameterTypes,
      returnType: returnType,
    });
  }

  analyze(): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    this.returnType.then((type) => {
      findings = AnalysisFindings.merge(findings, type.analyze());
    });
    for (const parameter of this.parameters) {
      findings = AnalysisFindings.merge(findings, parameter.analyze());
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
}

export class CompositeTypeLiteralAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  placeholders!: TypeLiteralAstNode[];
  closingBracket!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<CompositeTypeLiteralAstNode>) {
    Object.assign(this, params);
    this.closingBracket = Some(params.closingBracket);
  }

  analyze(): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    const type = typeTable.findType(this.name.text);
    if (!type.hasValue()) {
      findings.errors.push(AnalysisError({
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
        message: `The type called '${this.name.text}' could not be found.`,
      }));
      return findings;
    }
    const descriptiveType = this.resolveType();
    descriptiveType.typeCompatibleWith(type.unwrap(), {
      onPlaceholderCountMismatch: ({ expected, found }) => {
        findings.errors.push(AnalysisError({
          beginHighlight: DummyAstNode.fromToken(this.name),
          endHighlight: None(),
          message:
            `The type '${this.name.text}' expected ${expected} placeholders but ${found} were supplied.`,
        }));
      },
    });
    for (const placeholder of this.placeholders) {
      findings = AnalysisFindings.merge(findings, placeholder.analyze());
    }
    return findings;
  }

  resolveType(): SymbolType {
    const placeholderTypes = this.placeholders
      .map((placeholder) => placeholder.resolveType());
    const resolvedType = typeTable
      .findType(this.name.text)
      .unwrap()
      .fork(placeholderTypes);
    return resolvedType;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingBracket.unwrapOr(this.name)];
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

const compositeTypeName = apply(
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

const functionTypeLiteral = apply(
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
    compositeTypeName,
  ),
);
