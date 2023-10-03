import { AstNode } from "./ast.ts";
import { none, Option, some } from "./util/monad.ts";

// Symbol

export enum SymbolType {
  variable,
}

interface SymbolParams {
  symbolType: SymbolType;
  node?: AstNode;
  value?: SymbolValue<unknown>;
}

export class Symbol {
  symbolType: SymbolType;
  node: Option<AstNode>;
  value: Option<SymbolValue<unknown>>;

  constructor(params: SymbolParams) {
    this.node = params.node ? some(params.node) : none();
    this.symbolType = params.symbolType;
    this.value = params.value ? some(params.value) : none();
  }
}

// Symbol Value

enum SymbolValueType {
  number,
}

interface SymbolValueParams<T> {
  valueType: SymbolValueType;
  value: T;
}

class SymbolValue<T> {
  valueType: SymbolValueType;
  value: T;

  constructor(params: SymbolValueParams<T>) {
    this.valueType = params.valueType;
    this.value = params.value;
  }

  asNumber(): SymbolValue<number> {
    if (this.valueType !== SymbolValueType.number) {
      // safety
      // TODO: error handling, logging, ...
    }
    return this as SymbolValue<number>;
  }
}

// Symbol Table

type Scope = Map<string, Symbol>;

export class Table {
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
      return some(symbol);
    }
    return none();
  }

  findSymbolInCurrentScope(
    name: string,
    symbolType?: SymbolType,
  ): Option<Symbol> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current, symbolType);
    }
    return none();
  }

  findSymbol(name: string, symbolType?: SymbolType): Option<Symbol> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope, symbolType);
      if (symbol.kind === "none") {
        continue;
      }
      return symbol;
    }
    return none();
  }

  setSymbol(name: string, symbol: Symbol) {
    const current_scope = this.scopes[this.scopes.length - 1];
    current_scope.set(name, symbol);
  }
}
