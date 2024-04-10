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
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError, AnalysisFindings } from "../finding.ts";
import { TokenKind } from "../lexer.ts";
import {
  analysisTable,
  FunctionSymbolType,
  FunctionSymbolValue,
  resolveType,
  StaticSymbol,
  SymbolType,
  SymbolValue,
} from "../symbol.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import { kouter } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";
import { statements, StatementsAstNode } from "./statement.ts";

/* DATA TYPES */

type Function = StatementsAstNode;

/* AST NODES */

class ParameterAstNode {
  name!: Token<TokenKind>;
  type!: Token<TokenKind>;

  constructor(params: Attributes<ParameterAstNode>) {
    Object.assign(this, params);
  }

  check(): AnalysisFindings {
    const findings = AnalysisFindings.empty();
    const existingSymbol = analysisTable.findSymbol(this.name.text);
    if (existingSymbol.kind === "some") {
      findings.errors.push(AnalysisError({
        message:
          "Function parameter names have to be unique. Parameters can not share names with other variables.",
        messageHighlight:
          `A variable with the name "${this.name.text}" already exists. Please choose a different name.`,
        beginHighlight: { token: this.name },
        endHighlight: None(),
      }));
    }
    // TODO: check with TypeTable in the future (user defined types)
    // In the meantime, primitive types are checked manually
    if (!["boolean", "number", "string"].includes(this.type.text)) {
      findings.errors.push(AnalysisError({
        message:
          "Function parameters can only be primitive for now. This will change in the future.",
        beginHighlight: { token: this.type },
        endHighlight: None(),
      }));
    }
    return findings;
  }

  resolveType(): SymbolType {
    return resolveType(this.type.text);
  }
}

class FunctionAstNode implements EvaluableAstNode {
  parameters!: ParameterAstNode[];
  returnType!: Option<Token<TokenKind>>;
  statements!: StatementsAstNode;

  constructor(params: Attributes<FunctionAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): SymbolValue<Function> {
    const params = this.parameters.map((v) => v.resolveType());
    const returnType = this.returnType.map((token) => resolveType(token.text));
    return new FunctionSymbolValue(this.statements, params, returnType);
  }

  analyze(): AnalysisFindings {
    analysisTable.pushScope();
    let findings = AnalysisFindings.empty();
    findings = this.parameters
      .map((parameter) => parameter.check())
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
        new StaticSymbol({ valueKind: parameterTypes[index] }),
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
    const returnType = this.returnType.map((token) => resolveType(token.text));
    return new FunctionSymbolType({
      parameters: parameterTypes,
      returnType: returnType,
    });
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

export const functionDefinition = apply(
  kright(
    str("function"),
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
      kmid(
        str("{"),
        statements,
        str("}"),
      ),
    ),
  ),
  ([parameters, returnType, statements]) =>
    new FunctionAstNode({
      parameters: parameters,
      returnType: returnType,
      statements: statements,
    }),
);
