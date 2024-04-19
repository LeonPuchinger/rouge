import { AstNode } from "./ast.ts";
import { StatementsAstNode } from "./features/statement.ts";
import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { Attributes } from "./util/type.ts";

/* ~~~~~~ TEMPORARY ~~~~~~ */

// TODO: replace with TypeTable

export function resolveType(input: string): SymbolType {
  if (["boolean", "number"].includes(input)) {
    // @ts-ignore type check has been performed in the if statement above
    return new PrimitiveSymbolType(input);
  }
  throw new InternalError(
    "unable to resolve type.",
    `Unknown input: "${input}".`,
  );
}

/* ~~~~~~ TEMPORARY ~~~~~~ */

// Symbol

interface Symbol {
  node: Option<AstNode>;
}

export class RuntimeSymbol implements Symbol {
  node: Option<AstNode>;
  value: SymbolValue<unknown>;

  constructor(params: { node?: AstNode; value: SymbolValue }) {
    this.node = Some(params.node);
    this.value = params.value;
  }
}

export class StaticSymbol implements Symbol {
  node: Option<AstNode>;
  valueType: SymbolType;

  constructor(params: { node?: AstNode; valueType: SymbolType }) {
    this.node = Some(params.node);
    this.valueType = params.valueType;
  }
}

// Symbol Type

export interface SymbolType {
  typeCompatibleWith(other: SymbolType): boolean;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
}

type PrimitiveSymbolTypeKind = "number" | "boolean";

export class PrimitiveSymbolType implements SymbolType {
  constructor(private kind: PrimitiveSymbolTypeKind) {}

  typeCompatibleWith(other: SymbolType): boolean {
    return other instanceof PrimitiveSymbolType && other.kind === this.kind;
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return kind === this.kind;
  }
}

export class FunctionSymbolType implements SymbolType {
  parameters!: SymbolType[];
  returnType!: Option<SymbolType>;

  constructor(params: Attributes<FunctionSymbolType>) {
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      return false;
    }
    const matchingReturnTypes = other.returnType
      .zip(this.returnType)
      .map((returnTypes) => returnTypes[0].typeCompatibleWith(returnTypes[1]))
      .unwrapOr(false);
    if (!matchingReturnTypes) {
      return false;
    }
    if (other.parameters.length !== this.parameters.length) {
      return false;
    }
    return other.parameters.every((value, index) =>
      value.typeCompatibleWith(this.parameters[index])
    );
  }

  isPrimitive(): boolean {
    return false;
  }
}

// Symbol Value

export interface SymbolValue<T = unknown> {
  valueType: SymbolType;
  value: T;
  map(fn: (value: T) => T): SymbolValue<T>;
  typeCompatibleWith(other: SymbolValue<unknown>): boolean;
}

export class BooleanSymbolValue implements SymbolValue<boolean> {
  valueType: SymbolType = new PrimitiveSymbolType("boolean");

  constructor(public value: boolean) {}

  map(fn: (value: boolean) => boolean): SymbolValue<boolean> {
    return new BooleanSymbolValue(fn(this.value));
  }

  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

export class NumericSymbolValue implements SymbolValue<number> {
  valueType: SymbolType = new PrimitiveSymbolType("number");

  constructor(public value: number) {}

  map(fn: (value: number) => number): SymbolValue<number> {
    return new NumericSymbolValue(fn(this.value));
  }
  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

export class FunctionSymbolValue implements SymbolValue<StatementsAstNode> {
  valueType: SymbolType;

  constructor(
    public value: StatementsAstNode,
    parameterTypes: SymbolType[],
    returnType: Option<SymbolType>,
  ) {
    this.valueType = new FunctionSymbolType({
      parameters: parameterTypes,
      returnType: returnType,
    });
  }

  map(
    fn: (value: StatementsAstNode) => StatementsAstNode,
  ): SymbolValue<StatementsAstNode> {
    return { ...this, value: fn(this.value) };
  }

  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

// Symbol Table

type Scope<S extends Symbol> = Map<string, S>;

export type InterpreterSymbolTable = SymbolTable<RuntimeSymbol>;
export type AnalysisSymbolTable = SymbolTable<StaticSymbol>;

export class SymbolTable<S extends Symbol> {
  private scopes: Scope<S>[] = [new Map()];

  pushScope() {
    this.scopes.push(new Map());
  }

  popScope() {
    this.scopes.pop();
    if (this.scopes.length == 0) {
      // panic & log error
    }
  }

  private findSymbolInScope(
    name: string,
    scope: Scope<S>,
  ): Option<S> {
    const symbol = scope.get(name);
    return Some(symbol);
  }

  findSymbolInCurrentScope(
    name: string,
  ): Option<S> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current);
    }
    return None();
  }

  findSymbol(name: string): Option<S> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return None();
  }

  setSymbol(name: string, symbol: S) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}

export const analysisTable: AnalysisSymbolTable = new SymbolTable();
export const runtimeTable: InterpreterSymbolTable = new SymbolTable();
