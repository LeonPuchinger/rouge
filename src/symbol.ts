import { AstNode } from "./ast.ts";
import { Panic } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";

// Symbol

export enum SymbolKind {
  variable,
}

interface SymbolParams {
  symbolKind: SymbolKind;
  node?: AstNode;
  value?: SymbolValue<unknown>;
}

export class Symbol {
  symbolKind: SymbolKind;
  node: Option<AstNode>;
  value: Option<SymbolValue<unknown>>;

  constructor(params: SymbolParams) {
    this.node = Some(params.node);
    this.symbolKind = params.symbolKind;
    this.value = Some(params.value);
  }
}

// Symbol Value

export enum SymbolValueKind {
  number,
  identifier,
}

interface SymbolValueParams<T> {
  valueKind: SymbolValueKind;
  value: T;
}

export class SymbolValue<T> {
  valueKind: SymbolValueKind;
  value: T;

  constructor(params: SymbolValueParams<T>) {
    this.valueKind = params.valueKind;
    this.value = params.value;
  }

  asNumber(): SymbolValue<number> {
    if (this.valueKind !== SymbolValueKind.number) {
      throw Panic(
        "tried to access the value of a non-numeric symbol as a number",
      );
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
    symbolKind?: SymbolKind,
  ): Option<Symbol> {
    const symbol = scope.get(name);
    if (symbolKind && symbol?.symbolKind) {
      return Some(symbol);
    }
    return None();
  }

  findSymbolInCurrentScope(
    name: string,
    symbolKind?: SymbolKind,
  ): Option<Symbol> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current, symbolKind);
    }
    return None();
  }

  findSymbol(name: string, symbolKind?: SymbolKind): Option<Symbol> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope, symbolKind);
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
