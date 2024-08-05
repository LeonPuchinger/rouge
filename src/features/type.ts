import {
  alt_sc,
  apply,
  kright,
  list_sc,
  nil,
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
import {
  DescriptiveCompositeSymbolType,
  DescriptiveFunctionSymbolType,
  DescriptiveSymbolType,
  typeTable,
} from "../type.ts";
import { Option, Some } from "../util/monad/index.ts";
import { None } from "../util/monad/option.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { nothingType, WithOptionalAttributes } from "../util/type.ts";

/* AST NODES */

type TypeNameAstNode = FunctionTypeNameAstNode | CompositeTypeNameAstNode;

export class FunctionTypeNameAstNode
  implements Partial<EvaluableAstNode<void, DescriptiveSymbolType>> {
  name!: Token<TokenKind>;
  parameters!: TypeNameAstNode[];
  placeholders!: TypeNameAstNode[];
  returnType!: Option<TypeNameAstNode>;
  closingBracket!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<FunctionTypeNameAstNode>) {
    Object.assign(this, params);
    this.closingBracket = Some(params.closingBracket);
  }

  resolveType(): DescriptiveSymbolType {
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType()
    );
    const placeholderTypes = this.placeholders.map((placeholder) =>
      placeholder.resolveType()
    );
    const returnType = this.returnType.map((node) => node.resolveType())
      .unwrapOr(nothingType);
    return new DescriptiveFunctionSymbolType({
      parameterTypes: parameterTypes,
      placeholderTypes: placeholderTypes,
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
          this.closingBracket
            .unwrapOr(this.name),
        ),
    ];
  }
}

export class CompositeTypeNameAstNode
  implements Partial<EvaluableAstNode<void, DescriptiveSymbolType>> {
  name!: Token<TokenKind>;
  placeholders!: CompositeTypeNameAstNode[];
  closingBracket!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<CompositeTypeNameAstNode>) {
    Object.assign(this, params);
    this.closingBracket = Some(params.closingBracket);
  }

  resolveType(): DescriptiveSymbolType {
    const placeholderTypes = this.placeholders.map((placeholder) =>
      placeholder.resolveType()
    );
    return new DescriptiveCompositeSymbolType({
      id: this.name.text,
      placeholders: placeholderTypes,
    });
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
    const expectedAmountOfPlaceholders = type.unwrap().placeholders.size;
    const foundAmountOfPlaceholders = this.placeholders.length;
    if (expectedAmountOfPlaceholders != foundAmountOfPlaceholders) {
      findings.errors.push(AnalysisError({
        beginHighlight: DummyAstNode.fromToken(this.name),
        endHighlight: None(),
        message:
          `The type '${this.name.text}' expected ${expectedAmountOfPlaceholders} placeholders but ${foundAmountOfPlaceholders} were supplied.`,
      }));
      return findings;
    }
    for (const placeholder of this.placeholders) {
      findings = AnalysisFindings.merge(findings, placeholder.analyze());
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingBracket.unwrapOr(this.name)];
  }
}

/* PARSER */

export const typeName = rule<TokenKind, TypeNameAstNode>();

const placeholderList = kright(
  surround_with_breaking_whitespace(str("<")),
  seq(
    list_sc(
      typeName,
      surround_with_breaking_whitespace(str(",")),
    ),
    surround_with_breaking_whitespace(str(">")),
  ),
);

const compositeTypeName = apply(
  seq(
    tok(TokenKind.ident),
    opt_sc(placeholderList),
  ),
  ([name, placeholders]) =>
    new CompositeTypeNameAstNode({
      name: name,
      placeholders: placeholders?.[0] ?? [],
      closingBracket: placeholders?.[1],
    }),
);

const functionTypeName = nil();

typeName.setPattern(
  alt_sc(
    compositeTypeName,
    compositeTypeName, // TODO: replace w/ functionTypeName
  ),
);
