import { AstNode } from "./ast.ts";
import { None, Option, Some } from "./util/monad/index.ts";

// Symbol

interface SymbolParams {
  node?: AstNode;
  value: SymbolValue<unknown>;
}

interface Symbol {
  node: Option<AstNode>;
}

export class RuntimeSymbol implements Symbol {
  node: Option<AstNode>;
  value: SymbolValue<unknown>;

  constructor(params: SymbolParams) {
    this.node = Some(params.node);
    this.value = params.value;
  }
}

export class StaticSymbol implements Symbol {
  node: Option<AstNode>;
  valueKind: SymbolValueKind;

  constructor(
    params: Omit<SymbolParams, "value"> & { valueKind: SymbolValueKind },
  ) {
    this.node = Some(params.node);
    this.valueKind = params.valueKind;
  }
}

// Symbol Value

export enum SymbolValueKind {
  number,
  boolean,
}

export interface SymbolValue<T> {
  valueKind: SymbolValueKind;
  value: T;
};

export function BooleanSymbolValue(value: boolean): SymbolValue<boolean> {
  return {
    valueKind: SymbolValueKind.boolean,
    value: value,
  };
}

export function NumericSymbolValue(value: number): SymbolValue<number> {
  return {
    valueKind: SymbolValueKind.number,
    value: value,
  };
}

// Symbol Table

type Scope<SymbolType> = Map<string, SymbolType>;

export type InterpreterSymbolTable = SymbolTable<RuntimeSymbol>;
export type AnalysisSymbolTable = SymbolTable<StaticSymbol>;

export class SymbolTable<SymbolType extends Symbol> {
  private scopes: Scope<SymbolType>[] = [new Map()];

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
    scope: Scope<SymbolType>,
  ): Option<SymbolType> {
    const symbol = scope.get(name);
    return Some(symbol);
  }

  findSymbolInCurrentScope(
    name: string,
  ): Option<SymbolType> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current);
    }
    return None();
  }

  findSymbol(name: string): Option<SymbolType> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return None();
  }

  setSymbol(name: string, symbol: SymbolType) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}
