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
  value: SymbolValue<unknown>;
}

interface Symbol {
  symbolKind: SymbolKind;
  node: Option<AstNode>;
}

export class RuntimeSymbol implements Symbol {
  symbolKind: SymbolKind;
  node: Option<AstNode>;
  value: SymbolValue<unknown>;

  constructor(params: SymbolParams) {
    this.symbolKind = params.symbolKind;
    this.node = Some(params.node);
    this.value = params.value;
  }
}

export class StaticSymbol implements Symbol {
  symbolKind: SymbolKind;
  node: Option<AstNode>;
  valueKind: SymbolValueKind;

  constructor(
    params: Omit<SymbolParams, "value"> & { valueKind: SymbolValueKind },
  ) {
    this.symbolKind = params.symbolKind;
    this.node = Some(params.node);
    this.valueKind = params.valueKind;
  }
}

// Symbol Value

export enum SymbolValueKind {
  number,
  boolean,
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
    symbolKind?: SymbolKind,
  ): Option<SymbolType> {
    const symbol = scope.get(name);
    if (symbolKind === undefined) {
      return Some(symbol);
    }
    if (symbol?.symbolKind === symbolKind) {
      return Some(symbol);
    }
    return None();
  }

  findSymbolInCurrentScope(
    name: string,
    symbolKind?: SymbolKind,
  ): Option<SymbolType> {
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolInScope(name, current, symbolKind);
    }
    return None();
  }

  findSymbol(name: string, symbolKind?: SymbolKind): Option<SymbolType> {
    for (const current_scope of this.scopes.toReversed()) {
      const symbol = this.findSymbolInScope(name, current_scope, symbolKind);
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
