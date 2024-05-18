import {
  alt_sc,
  apply,
  kmid,
  kright,
  list_sc,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { AstNode, EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  FunctionSymbolValue,
  StaticSymbol,
  SymbolValue,
} from "../symbol.ts";
import { FunctionSymbolType, SymbolType, typeTable } from "../type.ts";
import { UnresolvableSymbolTypeError } from "../util/error.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import { kouter } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { ConditionAstNode } from "./condition.ts";
import { functionDefinition } from "./parser_declarations.ts";
import {
  StatementAstNode,
  statements,
  StatementsAstNode,
} from "./statement.ts";

/* DATA TYPES */

type Function = StatementsAstNode;

/* AST NODES */

class ParameterAstNode implements Partial<EvaluableAstNode> {
  name!: Token<TokenKind>;
  type!: Token<TokenKind>;

  constructor(params: Attributes<ParameterAstNode>) {
    Object.assign(this, params);
  }

  analyze(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const existingSymbol = analysisTable.findSymbol(this.name.text);
    if (existingSymbol.kind === "some") {
      findings.errors.push(AnalysisError({
        message:
          "Function parameter names have to be unique. Parameters can not share names with other variables.",
        messageHighlight:
          `A variable with the name "${this.name.text}" already exists. Please choose a different name.`,
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    if (typeTable.findType(this.type.text).kind === "none") {
      findings.errors.push(AnalysisError({
        message: `The type called "${this.type.text}" could not be found.`,
        // TODO: Find a way to only highlight the type, e.g. through a dummy AST node created on the spot
        beginHighlight: this,
        endHighlight: None(),
      }));
    }
    return findings;
  }

  resolveType(): SymbolType {
    const parameterType = typeTable.findType(this.type.text);
    return parameterType.unwrapOrThrow(UnresolvableSymbolTypeError());
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.name, this.type];
  }
}

/**
 * Creates a control flow graph (CFG) of a list of statements.
 * The CFG is a list of all possible branches/paths to traverse the statements.
 * A branch is forked when the statements contain a condition or a loop, for instance.
 *
 * @param statements
 */
function uniqueBranches(statements: StatementAstNode[]): AstNode[][] {
  const current = statements.at(0);
  if (current === undefined) {
    return [[]];
  }
  const remaining = statements.slice(1);
  if (current instanceof ConditionAstNode) {
    const trueStatements = [...current.trueStatements.children, ...remaining];
    const falseStatements = current.falseStatements
      .map((node) => [...node.children, ...remaining])
      .unwrapOr(remaining);
    return [
      ...uniqueBranches(trueStatements),
      ...uniqueBranches(falseStatements),
    ];
  }
  return uniqueBranches(remaining)
    .map((branch) => [current, ...branch]);
}

export class FunctionAstNode implements EvaluableAstNode {
  parameters!: ParameterAstNode[];
  returnType!: Option<Token<TokenKind>>;
  statements!: StatementsAstNode;
  functionKeywordToken!: Token<TokenKind>;
  closingBraceToken!: Token<TokenKind>;

  constructor(params: Attributes<FunctionAstNode>) {
    Object.assign(this, params);
    this.statements.configure({ representsFrame: true });
  }

  evaluate(): SymbolValue<Function> {
    const params = this.parameters.map((v) => v.resolveType());
    const returnType = this.returnType
      .flatMap((token) => typeTable.findType(token.text));
    return new FunctionSymbolValue(this.statements, params, returnType);
  }

  analyze(): AnalysisFindings {
    analysisTable.pushScope();
    let findings = AnalysisFindings.empty();
    findings = this.parameters
      .map((parameter) => parameter.analyze())
      .reduce(
        (previous, current) => AnalysisFindings.merge(previous, current),
        findings,
      );
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType()
    );
    for (const index in this.parameters) {
      analysisTable.setSymbol(
        this.parameters[index].name.text,
        new StaticSymbol({ valueType: parameterTypes[index] }),
      );
    }
    // TODO: introduce return statements and check with return type
    analysisTable.popScope();
    return findings;
  }

  resolveType(): SymbolType {
    const parameterTypes = this.parameters.map((parameter) =>
      parameter.resolveType()
    );
    const returnType = this.returnType
      .flatMap((token) => typeTable.findType(token.text));
    return new FunctionSymbolType({
      parameters: parameterTypes,
      returnType: returnType,
    });
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [this.functionKeywordToken, this.closingBraceToken];
  }
}

export class ReturnStatementAstNode implements InterpretableAstNode {
  interpret(): void {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisFindings {
    throw new Error("Method not implemented.");
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    throw new Error("Method not implemented.");
  }
}

/* PARSER */

export const parameter = apply(
  kouter(
    tok(TokenKind.ident),
    str(":"),
    tok(TokenKind.ident),
  ),
  ([ident, type]) =>
    new ParameterAstNode({
      name: ident,
      type: type,
    }),
);

const parameters = apply(
  alt_sc(
    list_sc(parameter, str(",")),
    parameter,
  ),
  (v) => [v].flat(),
);

const returnType = apply(
  opt_sc(tok(TokenKind.ident)),
  (token) => Some(token),
);

functionDefinition.setPattern(apply(
  seq(
    str<TokenKind>("function"),
    seq(
      kmid(
        str("("),
        parameters,
        str(")"),
      ),
      kright(
        seq(str("-"), str(">")),
        returnType,
      ),
      seq(
        str<TokenKind>("{"),
        statements,
        str<TokenKind>("}"),
      ),
    ),
  ),
  ([
    functionKeyword,
    [parameters, returnType, [_, statements, closingBrace]],
  ]) =>
    new FunctionAstNode({
      parameters: parameters,
      returnType: returnType,
      statements: statements,
      functionKeywordToken: functionKeyword,
      closingBraceToken: closingBrace,
    }),
));
