import { AstNode } from "./ast.ts";
import { StatementsAstNode } from "./features/statement.ts";
import {
  CompositeSymbolType,
  FunctionSymbolType,
  PlaceholderSymbolType,
  SymbolType,
} from "./type.ts";
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

  /**
   * Create a new SymbolValue by transforming the current value.
   */
  map(fn: (value: T) => T): SymbolValue<T>;

  /**
   * Replace the current value in the SymbolValue with a new value.
   */
  write(value: T): void;
}

export class BooleanSymbolValue implements SymbolValue<boolean> {
  valueType: SymbolType = new CompositeSymbolType({ id: "Boolean" });

  constructor(public value: boolean) {}

  map(fn: (value: boolean) => boolean): SymbolValue<boolean> {
    return new BooleanSymbolValue(fn(this.value));
  }

  write(value: boolean): void {
    this.value = value;
  }
}

export class NumericSymbolValue implements SymbolValue<number> {
  valueType: SymbolType = new CompositeSymbolType({ id: "Number" });

  constructor(public value: number) {}

  map(fn: (value: number) => number): SymbolValue<number> {
    return new NumericSymbolValue(fn(this.value));
  }

  write(value: number): void {
    this.value = value;
  }
}

export class StringSymbolValue implements SymbolValue<string> {
  valueType: SymbolType = new CompositeSymbolType({ id: "String" });

  constructor(public value: string) {}

  map(fn: (value: string) => string): SymbolValue<string> {
    return new StringSymbolValue(fn(this.value));
  }

  write(value: string): void {
    this.value = value;
  }
}

export class FunctionSymbolValue implements SymbolValue<StatementsAstNode> {
  value: StatementsAstNode;
  valueType: SymbolType;
  parameterNames: string[];

  constructor(params: {
    value: StatementsAstNode;
    parameterTypes: Map<string, SymbolType>;
    placeholderTypes?: Map<string, PlaceholderSymbolType>;
    returnType: SymbolType;
  }) {
    params.placeholderTypes ??= new Map();
    this.value = params.value;
    this.valueType = new FunctionSymbolType({
      parameterTypes: Array.from(params.parameterTypes.values()),
      placeholders: params.placeholderTypes,
      returnType: params.returnType,
    });
    this.parameterNames = Array.from(params.parameterTypes.keys());
  }

  map(
    fn: (value: StatementsAstNode) => StatementsAstNode,
  ): SymbolValue<StatementsAstNode> {
    return { ...this, value: fn(this.value) };
  }

  write(value: StatementsAstNode): void {
    this.value = value;
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

  write(value: Map<string, SymbolValue>): void {
    this.value = value;
  }
}

// Symbol Table

export type SymbolFlags = {
  readonly: boolean;
  /**
   * Whether the symbol is part of the standard library.
   * This flag is used primarly to identify functions that require
   * access to runtime bindings and types.
   */
  stdlib: boolean;
};

type SymbolEntry<S extends Symbol> = SymbolFlags & {
  symbol: S;
};

type Scope<S extends Symbol> = Map<string, SymbolEntry<S>>;

export type InterpreterSymbolTable = SymbolTable<RuntimeSymbol>;
export type AnalysisSymbolTable = SymbolTable<StaticSymbol>;

export class SymbolTable<S extends Symbol> {
  private scopes: Scope<S>[] = [new Map()];
  /**
   * Symbols that belong to the runtime are kept in a separate namespace.
   * When looking up symbols via their name, runtime bindings are considered first.
   * This behavior can be disabled by setting `ignoreRuntimeBindings` to `true`.
   */
  private runtimeBindings = new Map<string, S>();
  /**
   * When set to `true`, the table will act as if symbols stored
   * in the `runtimeBindings` namespace do not exist.
   */
  ignoreRuntimeBindings = true;
  /**
   * When a flag is set globally as an override, it is automatically
   * applied to all symbols that are inserted into the table.
   * This becomes useful, for instance, when initializing the stdlib.
   * There, the `readonly` flag can be set for all symbols contained in the stdlib.
   * When an override is set to `"notset"`, it is not applied to any symbol.
   * Also, in case a flag is explicitly set when a symbol is inserted
   * into the table, the global flag is ignored.
   */
  private globalFlagOverrides: {
    [K in keyof SymbolFlags]: SymbolFlags[K] | "notset";
  } = {
    readonly: "notset",
    stdlib: "notset",
  };

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

  private findSymbolEntryInScope(
    name: string,
    scope: Scope<S>,
  ): Option<SymbolEntry<S>> {
    const entry = scope.get(name);
    return Some(entry);
  }

  findSymbolInCurrentScope(
    name: string,
  ): Option<[S, SymbolFlags]> {
    if (!this.ignoreRuntimeBindings) {
      const runtimeBinding = this.runtimeBindings.get(name);
      if (runtimeBinding !== undefined) {
        return Some([runtimeBinding, { readonly: true, stdlib: false }]);
      }
    }
    const current = this.scopes.toReversed().at(0);
    if (current !== undefined) {
      return this.findSymbolEntryInScope(name, current)
        .map((entry) => {
          const { symbol, ...flags } = entry;
          return [symbol, flags];
        });
    }
    return None();
  }

  findSymbol(name: string): Option<[S, SymbolFlags]> {
    if (!this.ignoreRuntimeBindings) {
      const runtimeBinding = this.runtimeBindings.get(name);
      if (runtimeBinding !== undefined) {
        return Some([runtimeBinding, { readonly: true, stdlib: false }]);
      }
    }
    for (const currentScope of this.scopes.toReversed()) {
      const entry = this.findSymbolEntryInScope(name, currentScope)
        .map((entry) => {
          const { symbol, ...flags } = entry;
          return [symbol, flags];
        });
      if (!entry.hasValue()) {
        continue;
      }
      return entry as Option<[S, SymbolFlags]>;
    }
    return None();
  }

  setSymbol(
    name: string,
    symbol: S,
    readonly?: boolean,
    stdlib?: boolean,
  ) {
    const currentScope = this.scopes[this.scopes.length - 1];
    const existingEntry = Some(currentScope.get(name));
    existingEntry.then((entry) => {
      if (entry.readonly) {
        throw new InternalError(
          `Attempted to reassign the existing symbol with the name "${name}".`,
          `However, the symbol is flagged as readonly.`,
        );
      }
    });
    currentScope.set(name, {
      symbol,
      readonly: readonly ?? this.getGlobalFlagOverride("readonly"),
      stdlib: stdlib ?? this.getGlobalFlagOverride("stdlib"),
    });
  }

  setRuntimeBinding(name: string, symbol: S) {
    this.runtimeBindings.set(name, symbol);
  }

  /**
   * See the `globalFlagOverrides` attribute for more information.
   */
  private getGlobalFlagOverride(
    flag: keyof SymbolFlags,
  ): SymbolFlags[keyof SymbolFlags] {
    const override = this.globalFlagOverrides[flag];
    if (override === "notset") {
      return false;
    }
    return override;
  }

  /**
   * When a flag is set globally as an override, that flag is automatically
   * applied to all symbols that are inserted into the table.
   * Look at the `globalFlagOverrides` attribute for more information.
   */
  setGlobalFlagOverrides(
    flags: { [K in keyof SymbolFlags]?: SymbolFlags[K] | "notset" },
  ) {
    for (const [key, value] of Object.entries(flags)) {
      this.globalFlagOverrides[key as keyof SymbolFlags] = value;
    }
  }

  /**
   * Resets the symbol table to its initial state. Runtime bindings are wiped as well,
   * unless the `keepRuntimeBindings` flag is set to `true` (default setting).
   */
  reset(
    keepRuntimeBindings = true,
  ) {
    this.scopes = [new Map()];
    if (!keepRuntimeBindings) {
      this.runtimeBindings = new Map();
    }
    this.globalFlagOverrides = {
      readonly: "notset",
      stdlib: "notset",
    };
  }
}
