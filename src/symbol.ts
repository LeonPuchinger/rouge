import { UncheckedAstNode } from "./ast.ts";
import { Panic } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";

// Symbol

export enum SymbolType {
  variable,
}

interface SymbolParams {
  symbolType: SymbolType;
  node?: UncheckedAstNode;
  value: SymbolValue<unknown>;
}

export class Symbol {
  symbolType: SymbolType;
  node: Option<UncheckedAstNode>;
  value: SymbolValue<unknown>;

  constructor(params: SymbolParams) {
    this.node = params.node ? Some(params.node) : None();
    this.symbolType = params.symbolType;
    this.value = params.value;
  }
}

// Symbol Value

export enum SymbolValueType {
  number,
}

interface SymbolValueParams<T> {
  valueType: SymbolValueType;
  value: T;
}

export class SymbolValue<T> {
  valueType: SymbolValueType;
  value: T;

  constructor(params: SymbolValueParams<T>) {
    this.valueType = params.valueType;
    this.value = params.value;
  }

  asNumber(): SymbolValue<number> {
    if (this.valueType !== SymbolValueType.number) {
      throw Panic("tried to access the value of a non-numeric symbol as a number")
    }
    return this as SymbolValue<number>;
  }
}

// Symbol Table

type Scope = Map<string, Symbol>;

export class SymbolTable {
  private scopes: Scope[] = [new Map()];

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
    scope: Scope,
    symbolType?: SymbolType,
  ): Option<Symbol> {
    const symbol = scope.get(name);
    if (symbolType && symbol?.symbolType) {
      return Some(symbol);
    }
    return None();
  }

  findSymbolInCurrentScope(
    name: string,
    symbolType?: SymbolType,
  ): Option<Symbol> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current, symbolType);
    }
    return None();
  }

  findSymbol(name: string, symbolType?: SymbolType): Option<Symbol> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope, symbolType);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return None();
  }

  setSymbol(name: string, symbol: Symbol) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}
