import {
  alt_sc,
  apply,
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
import { AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import { SymbolType, typeTable } from "../type.ts";
import { UnresolvableSymbolTypeError } from "../util/error.ts";
import { Option, Some } from "../util/monad/index.ts";
import { surround_with_breaking_whitespace } from "../util/parser.ts";
import { WithOptionalAttributes } from "../util/type.ts";

/* AST NODES */

export class CompositeTypeNameAstNode
  implements Partial<EvaluableAstNode<void>> {
  name!: Token<TokenKind>;
  //TODO: placeholders
  closingBracket!: Option<Token<TokenKind>>;

  constructor(params: WithOptionalAttributes<CompositeTypeNameAstNode>) {
    Object.assign(this, params);
    this.closingBracket = Some(params.closingBracket);
  }

  resolveType(): SymbolType {
    const type = typeTable
      .findType(this.name.text)
      .unwrapOrThrow(UnresolvableSymbolTypeError());
    //TODO: actually bind types
    const boundTypes = new Map();
    return type.fork(boundTypes);
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.closingBracket.unwrapOr(this.name)];
  }
}

/* PARSER */

export const typeName = rule<TokenKind, SymbolType>();

const compositeTypeName = apply(
  seq(
    tok(TokenKind.ident),
    opt_sc(
      seq(
        surround_with_breaking_whitespace(str("<")),
        list_sc(
          tok(TokenKind.ident),
          surround_with_breaking_whitespace(str(",")),
        ),
        surround_with_breaking_whitespace(str(">")),
      ),
    ),
  ),
  ([name, placeholderNotation]) =>
    new CompositeTypeNameAstNode({
      name: name,
      closingBracket: placeholderNotation?.[2],
    }),
);

const functionTypeName = nil();

typeName.setPattern(
  alt_sc(
    compositeTypeName,
    functionTypeName,
  ),
);
