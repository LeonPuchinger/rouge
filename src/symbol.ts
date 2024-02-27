import { AstNode, StatementAstNodes } from "./ast.ts";
import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { Attributes } from "./util/type.ts";

/* ~~~~~~ TEMPORARY ~~~~~~ */

// TODO: replace with TypeTable

export function resolveType(input: string): SymbolType {
  if (["boolean", "number"].includes(input)) {
    // @ts-ignore type check has been performed in the if statement above
    return new PrimitiveSymbolType(input)
  }
  throw InternalError("unable to resolve type.", `Unknown input: "${input}".`);
}

/* ~~~~~~ TEMPORARY ~~~~~~ */

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
  valueKind: SymbolType;

  constructor(
    params: Omit<SymbolParams, "value"> & { valueKind: SymbolType },
  ) {
    this.node = Some(params.node);
    this.valueKind = params.valueKind;
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

export interface SymbolValue<T> {
  valueKind: SymbolType;
  value: T;
  typeCompatibleWith(other: SymbolValue<unknown>): boolean;
}

export function createBooleanSymbolValue(value: boolean): SymbolValue<boolean> {
  return {
    valueKind: new PrimitiveSymbolType("boolean"),
    value: value,
    typeCompatibleWith(other) {
      return other.typeCompatibleWith(this);
    },
  };
}

export function createNumericSymbolValue(value: number): SymbolValue<number> {
  return {
    valueKind: new PrimitiveSymbolType("number"),
    value: value,
    typeCompatibleWith(other) {
      return other.typeCompatibleWith(this);
    },
  };
}

export function createFunctionSymbolValue(
  value: StatementAstNodes,
  params: SymbolType[],
  returnType?: SymbolType,
): SymbolValue<StatementAstNodes> {
  return {
    valueKind: new FunctionSymbolType({
      parameters: params,
      returnType: Some(returnType),
    }),
    value: value,
    typeCompatibleWith(other) {
      return other.typeCompatibleWith(this);
    },
  };
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
