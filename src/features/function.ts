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
import {
  AnalysisFindings,
  AnalysisResult,
  analysisTable,
} from "../analysis.ts";
import { EvaluableAstNode } from "../ast.ts";
import { AnalysisError } from "../finding.ts";
import { TokenType } from "../lexer.ts";
import { statements } from "../parser.ts";
import { resolveType, SymbolType, SymbolValue } from "../symbol.ts";
import { AppError } from "../util/error.ts";
import { emptyFindings, mergeFindings } from "../util/finding.ts";
import { None, Some } from "../util/monad/index.ts";
import { Result } from "../util/monad/result.ts";
import { kouter } from "../util/parser.ts";
import { Attributes } from "../util/type.ts";

/* AST NODES */

class ParameterAstNode {
  name!: Token<TokenType>;
  type!: Token<TokenType>;

  constructor(params: Attributes<ParameterAstNode>) {
    Object.assign(this, params);
  }

  check(): AnalysisFindings {
    const findings = emptyFindings();
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
}

class FunctionAstNode implements EvaluableAstNode {
  parameters!: ParameterAstNode[];

  constructor(params: Attributes<FunctionAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): Result<SymbolValue<unknown>, AppError> {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisResult<SymbolType> {
    const findings = emptyFindings();
    this.parameters.map((parameter) =>
      mergeFindings(findings, parameter.check())
    );
  }
}

/* PARSER */

export const parameter = apply(
  kouter(
    tok(TokenType.ident),
    str(":"),
    tok(TokenType.ident),
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
  opt_sc(tok(TokenType.ident)),
  (token) => Some(token).map((token) => token.text),
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
  ([parameters, _returnType, _statements]) =>
    new FunctionAstNode({
      parameters: parameters,
    }),
);
