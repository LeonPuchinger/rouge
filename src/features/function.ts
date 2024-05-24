import {
  alt_sc,
  apply,
  kmid,
  kright,
  list_sc,
  opt,
  opt_sc,
  seq,
  str,
  tok,
  Token,
} from "typescript-parsec";
import { AstNode, EvaluableAstNode, InterpretableAstNode } from "../ast.ts";
import {
  AnalysisError,
  AnalysisFindings,
  AnalysisWarning,
} from "../finding.ts";
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
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
import { ConditionAstNode } from "./condition.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
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

function analyzeReturnPlacements(
  statements: StatementsAstNode,
): AnalysisFindings {
  const findings = AnalysisFindings.empty();
  if (statements.children.length === 0) {
    return findings;
  }
  const branches = uniqueBranches(statements.children);
  for (const branch of branches) {
    let returnFound = false;
    const remainingStatements = [];
    for (const statement of branch) {
      if (statement instanceof ReturnStatementAstNode) {
        returnFound = true;
        continue;
      }
      if (returnFound) {
        remainingStatements.push(statement);
      }
    }
    if (!returnFound && findings.errors.length === 0) {
      findings.errors.push(AnalysisError({
        message: "This function is missing a return statement somewhere",
        beginHighlight: statements.children.at(0)!,
        endHighlight: Some(statements.children.at(-1)),
      }));
    } else {
      if (remainingStatements.length > 0) {
        findings.warnings.push(AnalysisWarning({
          message:
            "These statements are never going to be run because they are situated after a return statement.",
          beginHighlight: new DummyAstNode({
            tokenFrom: remainingStatements[0].tokenRange()[0],
            tokenTo: remainingStatements[0].tokenRange()[1],
          }),
          endHighlight: Some(
            new DummyAstNode({
              tokenFrom: remainingStatements.at(-1)?.tokenRange()[0]!,
              tokenTo: remainingStatements.at(-1)?.tokenRange()[1]!,
            }),
          ),
        }));
      }
    }
  }
  return findings;
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
    findings = AnalysisFindings.merge(
      findings,
      analyzeReturnPlacements(this.statements),
    );
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
  keyword!: Token<TokenKind>;
  expression!: Option<ExpressionAstNode>;

  constructor(params: WithOptionalAttributes<ReturnStatementAstNode>) {
    Object.assign(this, params);
    this.expression = Some(params.expression);
  }

  interpret(): void {
    throw new Error("Method not implemented.");
  }

  analyze(): AnalysisFindings {
    const findings = this.expression
      .map((node) => node.analyze())
      .unwrapOr(AnalysisFindings.empty());
    const actualReturnType = this.expression.map((node) => node.resolveType());
    const supposedReturnType = typeTable.getReturnType();
    // curried version of AnalysisError with the highlighted range pre-applied
    const ReturnTypeError = (message: string, messageHighlight?: string) =>
      AnalysisError({
        message: message,
        beginHighlight: DummyAstNode.fromToken(this.keyword),
        endHighlight: this.expression,
        messageHighlight: messageHighlight,
      });
    if (
      supposedReturnType.kind === "some" && actualReturnType.kind === "none"
    ) {
      findings.errors.push(ReturnTypeError(
        "This function needs to return a value, however, this return statement is empty.",
      ));
      return findings;
    }
    if (
      supposedReturnType.kind === "none" && actualReturnType.kind === "some"
    ) {
      findings.errors.push(ReturnTypeError(
        "This function does not return a value, therefore return statements have to be empty.",
      ));
      return findings;
    }
    const matchingReturnTypes = actualReturnType
      .zip(supposedReturnType)
      .map(([actual, supposed]) => actual.typeCompatibleWith(supposed))
      .unwrapOr(false);
    if (!matchingReturnTypes) {
      findings.errors.push(
        ReturnTypeError(
          "The type of the returned value and the type that is supposed to be returned by the function do not match",
        ),
      );
    }
    return findings;
  }

  tokenRange(): [Token<TokenKind>, Token<TokenKind>] {
    return [
      this.keyword,
      this.expression
        .map((node) => node.tokenRange()[1])
        .unwrapOr(this.keyword),
    ];
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

const returnStatement = apply(
  kouter(
    str<TokenKind>("return"),
    opt(tok(TokenKind.breakingWhitespace)),
    expression,
  ),
  ([keyword, expression]) =>
    new ReturnStatementAstNode({
      keyword: keyword,
      expression: expression,
    }),
);
