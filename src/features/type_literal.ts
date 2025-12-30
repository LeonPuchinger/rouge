import {
  alt_sc,
  apply,
  kleft,
  kmid,
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
  PlaceholderSymbolType,
  SymbolType,
} from "../type.ts";
import { zip } from "../util/array.ts";
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
  placeholders!: Token<TokenKind>[];
  returnType!: Option<TypeLiteralAstNode>;
  closingParenthesis!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<FunctionTypeLiteralAstNode>) {
    Object.assign(this, params);
    this.returnType = Some(params.returnType);
    this.closingParenthesis = Some(params.closingParenthesis);
  }

  resolveType(environment: ExecutionEnvironment): SymbolType {
    const placeholders = new Map<string, PlaceholderSymbolType>(
      this.placeholders.map((placeholder) => [
        placeholder.text,
        new PlaceholderSymbolType({ name: placeholder.text }),
      ]),
    );
    environment.typeTable.pushScope();
    for (const placeholder of placeholders.values()) {
      environment.typeTable.setType(placeholder.name, placeholder);
    }
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType(environment)
    );
    const returnType = this.returnType.map((node) =>
      node.resolveType(environment)
    )
      .unwrapOr(nothingType(environment));
    environment.typeTable.popScope();
    return new FunctionSymbolType({
      parameterTypes: parameterTypes,
      placeholders: placeholders,
      returnType: returnType,
    });
  }

  analyze(environment: ExecutionEnvironment): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    for (const placeholder of this.placeholders) {
      environment.typeTable.findType(placeholder.text)
        .then(() => {
          findings.errors.push(AnalysisError(environment, {
            message:
              "Placeholders cannot have the same name as types that already exist in an outer scope.",
            beginHighlight: DummyAstNode.fromToken(placeholder),
            endHighlight: None(),
            messageHighlight:
              `A type by the name "${placeholder.text}" already exists.`,
          }));
        });
    }
    environment.typeTable.pushScope();
    for (const placeholder of this.placeholders) {
      const placeholderType = new PlaceholderSymbolType({
        name: placeholder.text,
      });
      environment.typeTable.setType(placeholder.text, placeholderType);
    }
    this.returnType.then((type) => {
      findings = AnalysisFindings.merge(findings, type.analyze(environment));
    });
    for (const parameter of this.parameters) {
      findings = AnalysisFindings.merge(
        findings,
        parameter.analyze(environment),
      );
    }
    environment.typeTable.popScope();
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
      ```
      type Bar<T> {
        foo: T
      }
      ```

      This type definition results in a `CompositeSymbolType` with a placeholder.
      `CompositeSymbolType`s keep a list of the placeholders that are used in the type so they
      can be bound positionally. When the type literal `T` for the field `foo` is resolved and forked,
      the placeholder stored in the `CompositeSymbolType` is not the same reference anymore as the type stored
      for the field `foo`. When `T` is bound globally for the type `Bar`, the type for `foo` is not updated
      accordingly anymore. Therefore, in case a type literal is not parametrized with placeholders, it
      should not be forked.

      Also, the type is only forked if the placeholders are not already set to the supplied types.

      Example:
      ```
      type Bar<T> {
        foo: Bar<T>
        bar: Bar<String>
      }
      ```

      A recursive (self-referential) type, such as the one in the example above, is created by a type definition
      that uses its own type literal as a field type or trait. The resolved type should be truly recursive, meaning
      that, where possible, the original instance should be referenced. If the type is forked every time the type
      literal is resolved, the recursion is broken and the type becomes unnecessarily nested instead of recursive.
      It is important, however, to still fork the type when the placeholders are set to a type other than the placeholder(s)
      that the type defines itself.
      For instance, in the example above, `foo` is of type `Bar<T>`, where `T` is the placeholder defined by `Bar` itself.
      Therefore, the parameter type of `foo` should be the original instance of `Bar`, keeping the recursion intact.
      In contrast, `bar` is of type `Bar<String>`, where the placeholder `T` is set to `String`, a different type.
      */
      const placeholdersAlreadySetToSuppliedTypes = zip(
        Array.from(resolvedType.placeholders.values()),
        placeholderTypes,
      ).every(([placeholder, suppliedType]) => placeholder == suppliedType);
      if (placeholdersAlreadySetToSuppliedTypes) {
        return resolvedType;
      }
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

const placeholderNames = kleft(
  list_sc(tok(TokenKind.ident), surround_with_breaking_whitespace(str(","))),
  opt_sc(starts_with_breaking_whitespace(str(","))),
);

const placeholders = kmid(
  str<TokenKind>("<"),
  surround_with_breaking_whitespace(opt_sc(placeholderNames)),
  str<TokenKind>(">"),
);

export const functionTypeLiteral = apply(
  seq(
    str<TokenKind>("Function"),
    opt_sc(starts_with_breaking_whitespace(placeholders)),
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
      placeholders,
      [_openingParenthesis, parameterList, closingParenthesis],
      returnType,
    ],
  ) =>
    new FunctionTypeLiteralAstNode({
      name: keyword,
      parameters: parameterList,
      placeholders: placeholders ?? [],
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
