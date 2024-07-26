import { AstNode } from "./ast.ts";
import { StatementsAstNode } from "./features/statement.ts";
import { CompositeSymbolType, FunctionSymbolType, SymbolType } from "./type.ts";
import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { WithOptionalAttributes } from "./util/type.ts";

// Symbol

export class RuntimeSymbol<T extends SymbolValue = SymbolValue<unknown>> {
  node!: Option<AstNode>;
  value!: T;

  constructor(params: WithOptionalAttributes<RuntimeSymbol>) {
    Object.assign(this, params);
    this.node = Some(params.node);
  }
}

export class StaticSymbol<T extends SymbolType = SymbolType> {
  node!: Option<AstNode>;
  valueType!: T;

  constructor(params: WithOptionalAttributes<StaticSymbol>) {
    Object.assign(this, params);
    this.node = Some(params.node);
  }
}

type Symbol = RuntimeSymbol | StaticSymbol;

// Symbol Value

export interface SymbolValue<T = unknown> {
  valueType: SymbolType;
  value: T;
  map(fn: (value: T) => T): SymbolValue<T>;
  typeCompatibleWith(other: SymbolValue<unknown>): boolean;
}

export class BooleanSymbolValue implements SymbolValue<boolean> {
  valueType: SymbolType = new CompositeSymbolType({ id: "Boolean" });

  constructor(public value: boolean) {}

  map(fn: (value: boolean) => boolean): SymbolValue<boolean> {
    return new BooleanSymbolValue(fn(this.value));
  }

  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

export class NumericSymbolValue implements SymbolValue<number> {
  valueType: SymbolType = new CompositeSymbolType({ id: "Number" });

  constructor(public value: number) {}

  map(fn: (value: number) => number): SymbolValue<number> {
    return new NumericSymbolValue(fn(this.value));
  }

  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

export class StringSymbolValue implements SymbolValue<string> {
  valueType: SymbolType = new CompositeSymbolType({ id: "String" });

  constructor(public value: string) {}

  map(fn: (value: string) => string): SymbolValue<string> {
    return new StringSymbolValue(fn(this.value));
  }

  typeCompatibleWith(other: SymbolValue<unknown>): boolean {
    return other.typeCompatibleWith(this);
  }
}

export class FunctionSymbolValue implements SymbolValue<StatementsAstNode> {
  valueType: SymbolType;
  parameterNames: string[];

  constructor(
    public value: StatementsAstNode,
    parameterTypes: Map<string, SymbolType>,
    returnType: SymbolType,
  ) {
    this.valueType = new FunctionSymbolType({
      parameters: Array.from(parameterTypes.values()),
      returnType: returnType,
    });
    this.parameterNames = Array.from(parameterTypes.keys());
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

export class CompositeSymbolValue
  implements SymbolValue<Map<string, SymbolValue>> {
  valueType: SymbolType;
  value: Map<string, SymbolValue>;

  constructor(params: {
    fields?: Map<string, [SymbolValue, SymbolType]>;
    id: string;
  }) {
    params.fields ??= new Map();
    this.value = new Map(
      Array.from(params.fields, ([name, [value, _type]]) => [name, value]),
    );
    this.valueType = new CompositeSymbolType({
      fields: new Map(
        Array.from(params.fields, ([name, [_value, type]]) => [name, type]),
      ),
      id: params.id,
    });
  }

  map(
    fn: (value: Map<string, SymbolValue>) => Map<string, SymbolValue>,
  ): SymbolValue<Map<string, SymbolValue>> {
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
    if (this.scopes.length === 0) {
      throw new InternalError(
        "The outermost scope of the symbol table has been popped.",
        "The symbol table always needs to consist of at least one scope.",
      );
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
    for (const currentScope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, currentScope);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return None();
  }

  setSymbol(name: string, symbol: S) {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.set(name, symbol);
  }
}

export const analysisTable: AnalysisSymbolTable = new SymbolTable();
export const runtimeTable: InterpreterSymbolTable = new SymbolTable();
