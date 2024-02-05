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
  function,
}

export interface SymbolValue<T> {
  valueKind: SymbolValueKind;
  value: T;
  typeCompatibleWith(other: SymbolValue<unknown>): boolean;
}

export function BooleanSymbolValue(value: boolean): SymbolValue<boolean> {
  return {
    valueKind: SymbolValueKind.boolean,
    value: value,
    typeCompatibleWith: (other) => other.valueKind === SymbolValueKind.boolean,
  };
}

export function NumericSymbolValue(value: number): SymbolValue<number> {
  return {
    valueKind: SymbolValueKind.number,
    value: value,
    typeCompatibleWith: (other) => other.value === SymbolValueKind.number,
  };
}

export interface Function {
  returnType: SymbolValueKind;
  params: SymbolValueKind[];
}

export function FunctionSymbolValue(value: Function): SymbolValue<Function> {
  return {
    valueKind: SymbolValueKind.function,
    value: value,
    typeCompatibleWith: (other) => {
      if (other.valueKind !== SymbolValueKind.function) {
        return false;
      }
      // TODO: check for params & return type compatability
      return true;
    },
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
