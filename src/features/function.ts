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
import { InternalError, UnresolvableSymbolTypeError } from "../util/error.ts";
import { None, Option, Some } from "../util/monad/index.ts";
import { kouter } from "../util/parser.ts";
import { DummyAstNode } from "../util/snippet.ts";
import { Attributes, WithOptionalAttributes } from "../util/type.ts";
import { ConditionAstNode } from "./condition.ts";
import { expression, ExpressionAstNode } from "./expression.ts";
import { functionDefinition, returnStatement } from "./parser_declarations.ts";
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

export class FunctionDefinitionAstNode implements EvaluableAstNode {
  parameters!: ParameterAstNode[];
  returnType!: Option<Token<TokenKind>>;
  statements!: StatementsAstNode;
  functionKeywordToken!: Token<TokenKind>;
  closingBraceToken!: Token<TokenKind>;

  constructor(params: Attributes<FunctionDefinitionAstNode>) {
    Object.assign(this, params);
  }

  evaluate(): SymbolValue<Function> {
    const params = this.parameters.map((v) => v.resolveType());
    const returnType = this.returnType
      .flatMap((token) => typeTable.findType(token.text));
    return new FunctionSymbolValue(this.statements, params, returnType);
  }

  /**
   * Creates a control flow graph (CFG) of the statements within the function.
   * The CFG is a list of all possible branches/paths to traverse the statements.
   * A branch is forked when the statements contain a condition or a loop, for instance.
   */
  uniqueBranches(statements: StatementAstNode[]): AstNode[][] {
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
        ...this.uniqueBranches(trueStatements),
        ...this.uniqueBranches(falseStatements),
      ];
    }
    return this.uniqueBranches(remaining)
      .map((branch) => [current, ...branch]);
  }

  /**
   * Analyzes whether a single branch of the CFG contains a return statement.
   * Each branch needs to contain at least one return statement.
   * Creating the finding for the missing return statement is delegated to the caller.
   * When there are statements after a return statement, a warning is added to the findings.
   */
  analyzeBranch(
    statements: AstNode[],
  ): { branchContainsReturn: boolean; branchFindings: AnalysisFindings } {
    const findings = AnalysisFindings.empty();
    const returnStatementIndex = statements.findIndex((value) =>
      value instanceof ReturnStatementAstNode
    );
    if (returnStatementIndex === undefined) {
      return { branchContainsReturn: false, branchFindings: findings };
    }
    const remainingStatements = statements.slice(returnStatementIndex);
    const unreachableCode = remainingStatements.length >= 1;
    if (unreachableCode) {
      findings.warnings.push(AnalysisWarning({
        message:
          "These statements are never going to be run because they are situated after a return statement.",
        beginHighlight: remainingStatements.at(0)!,
        endHighlight: Some(remainingStatements.at(-1)!),
      }));
    }
    return { branchContainsReturn: true, branchFindings: findings };
  }

  /**
   * Analyzes whether return statements in the function are placed in a legal way.
   * This method assumes that the function is required to return a non `Nothing` return value.
   */
  analyzeReturnPlacements(): AnalysisFindings {
    let findings = AnalysisFindings.empty();
    const functionEmpty = this.statements.children.length === 0;
    if (functionEmpty) {
      return findings;
    }
    const branches = this.uniqueBranches(this.statements.children);
    const missingReturnStatement = branches.some((branch) => {
      const {
        branchContainsReturn,
        branchFindings,
      } = this.analyzeBranch(branch);
      findings = AnalysisFindings.merge(findings, branchFindings);
      return !branchContainsReturn;
    });
    if (missingReturnStatement) {
      findings.errors.push(AnalysisError({
        message:
          "This function is missing at least one return statement somewhere.",
        beginHighlight: DummyAstNode.fromToken(this.functionKeywordToken),
        endHighlight: Some(DummyAstNode.fromToken(this.closingBraceToken)),
      }));
    }
    return findings;
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
    let returnTypeResolvable = false;
    if (this.returnType.kind === "some") {
      const returnTypeName = this.returnType.unwrap().text;
      returnTypeResolvable = typeTable
        .findType(returnTypeName)
        .map((_) => true)
        .unwrapOr(false);
      if (!returnTypeResolvable) {
        findings.errors.push(AnalysisError({
          message: "The return type specified for the function does not exist",
          beginHighlight: DummyAstNode.fromToken(this.returnType.unwrap()),
          endHighlight: None(),
        }));
      }
    }
    const nothingType = typeTable
      .findType("Nothing")
      .unwrapOrThrow(
        new InternalError(
          "The type called `Nothing` from the standard library could not be located.",
          "This type is required for basic language functionality.",
        ),
      );
    if (returnTypeResolvable) {
      typeTable.setReturnType(
        this.returnType
          .flatMap((token) => typeTable.findType(token.text))
          .unwrapOr(nothingType),
      );
    }
    findings = AnalysisFindings.merge(
      findings,
      this.analyzeReturnPlacements(),
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

/**
 * A custom error type that is NOT used for any actual error handling.
 * Statements inside of a function can be nested to various degrees
 * (e.g. conditions, loops). Therefore it can be difficult to get the
 * return value of a function from a return statement back to the caller.
 * This error is used to propagate ´the return value back through the
 * call stack to the nearest function, where it is caught.
 * The benefit of throwing an error is that execution of all nested
 * statements stops immediately without having to implement any further logic.
 */
class ReturnValueContainer extends Error {
  /**
   * @param value The value that is supposed to be returned.
   *  Can be `None` in case the function does not return anything,
   *  but an empty return statement is encountered.
   */
  constructor(public value: Option<SymbolValue>) {
    super();
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
    throw new ReturnValueContainer(
      this.expression.map((node) => node.evaluate()),
    );
  }

  analyze(): AnalysisFindings {
    const findings = this.expression
      .map((node) => node.analyze())
      .unwrapOr(AnalysisFindings.empty());
    const savedReturnType = typeTable.findReturnType();
    if (savedReturnType.kind === "none") {
      findings.errors.push(AnalysisError({
        message:
          "Return statements are only allowed inside of functions or methods",
        beginHighlight: DummyAstNode.fromToken(this.keyword),
        endHighlight: this.expression,
      }));
      return findings;
    }
    const supposedReturnType = savedReturnType.unwrap();
    const actualReturnType = this.expression.map((node) => node.resolveType());
    const nothingType = typeTable
      .findType("Nothing")
      .unwrapOrThrow(
        new InternalError(
          "The type called `Nothing` from the standard library could not be located.",
          "This type is required for basic language functionality.",
        ),
      );
    // curried version of AnalysisError with the highlighted range pre-applied
    const ReturnTypeError = (message: string, messageHighlight?: string) =>
      AnalysisError({
        message: message,
        beginHighlight: DummyAstNode.fromToken(this.keyword),
        endHighlight: this.expression,
        messageHighlight: messageHighlight,
      });
    const returnValueRequired = !supposedReturnType.typeCompatibleWith(
      nothingType,
    );
    const returnStatementEmpty = actualReturnType.kind === "none";
    if (returnValueRequired && returnStatementEmpty) {
      findings.errors.push(ReturnTypeError(
        "This function needs to return a value, however, this return statement is empty.",
      ));
      return findings;
    }
    if (!returnValueRequired && !returnStatementEmpty) {
      findings.errors.push(ReturnTypeError(
        "This function does not return a value, therefore return statements have to be empty.",
      ));
      return findings;
    }
    const matchingReturnTypes = actualReturnType
      .map((actual) => actual.typeCompatibleWith(supposedReturnType))
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
        opt_sc(parameters),
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
    new FunctionDefinitionAstNode({
      parameters: parameters ?? [],
      returnType: returnType,
      statements: statements,
      functionKeywordToken: functionKeyword,
      closingBraceToken: closingBrace,
    }),
));

returnStatement.setPattern(apply(
  kouter(
    str<TokenKind>("return"),
    opt(tok(TokenKind.breakingWhitespace)),
    opt_sc(expression),
  ),
  ([keyword, expression]) =>
    new ReturnStatementAstNode({
      keyword: keyword,
      expression: expression,
    }),
));
