import { InternalError } from "./util/error.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { WithOptionalAttributes } from "./util/type.ts";

type PrimitiveSymbolTypeKind = "Number" | "Boolean" | "String";

export interface SymbolType {
  typeCompatibleWith(other: SymbolType): boolean;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
  isFunction(): boolean;
}

export class FunctionSymbolType implements SymbolType {
  parameters!: Record<string, SymbolType>;
  returnType!: SymbolType;
  placeholders!: Map<string, PlaceholderSymbolType>;

  constructor(params: {
    parameters: Record<string, SymbolType>;
    returnType: SymbolType;
    placeholders?: Map<string, PlaceholderSymbolType>;
  }) {
    params.placeholders ??= new Map();
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      return false;
    }
    if (this.placeholders.size !== other.placeholders.size) {
      return false;
    }
    for (const placeholderName of this.placeholders.keys()) {
      const placeholder = this.placeholders.get(placeholderName)!;
      const otherPlaceholder = other.placeholders.get(placeholderName);
      if (otherPlaceholder === undefined) {
        return false;
      }
      if (placeholder.typeCompatibleWith(otherPlaceholder)) {
        return false;
      }
    }
    const matchingReturnTypes = other.returnType
      .typeCompatibleWith(this.returnType);
    if (!matchingReturnTypes) {
      return false;
    }
    const otherParameterNames = Object.keys(other.parameters);
    const thisParameterNames = Object.keys(this.parameters);
    if (otherParameterNames.length !== thisParameterNames.length) {
      return false;
    }
    const matchingNames = otherParameterNames.every((name) =>
      name in thisParameterNames
    );
    if (!matchingNames) {
      return false;
    }
    return otherParameterNames.every((name) =>
      other.parameters[name].typeCompatibleWith(this.parameters[name])
    );
  }

  isPrimitive(): boolean {
    return false;
  }

  isFunction(): boolean {
    return true;
  }
}

/**
 * Represents a user defined type that is made up of other types.
 * The individual types that make up the type as a whole are referred to as fields.
 * Each field consists of a name and a type.
 * Two instances of `CompositeSymbolType` are type compatible in case they contain
 * the same amount of field, the fields have the same names,
 * and the types for each field are type compatible themselves.
 */
export class CompositeSymbolType implements SymbolType {
  id!: string;
  fields!: Map<string, SymbolType>;
  placeholders!: Map<string, PlaceholderSymbolType>;

  /**
   * @param fields The key-value pairs of name and type that make up this user defined type.
   */
  constructor(
    params: {
      id: string;
      fields?: Map<string, SymbolType>;
      placeholders?: Map<string, PlaceholderSymbolType>;
    },
  ) {
    params.fields ??= new Map();
    params.placeholders ??= new Map();
    Object.assign(this, params);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    if (!(other instanceof CompositeSymbolType)) {
      return false;
    }
    if (this.id !== other.id) {
      return false;
    }
    if (this.placeholders.size !== other.placeholders.size) {
      return false;
    }
    for (const placeholderName of this.placeholders.keys()) {
      const placeholder = this.placeholders.get(placeholderName)!;
      const otherPlaceholder = other.placeholders.get(placeholderName);
      if (otherPlaceholder === undefined) {
        return false;
      }
      if (placeholder.typeCompatibleWith(otherPlaceholder)) {
        return false;
      }
    }
    // TODO: additional checks beyond id and placeholders should only produce an `InternalError` in case of mismatch
    const thisKeys = Array.from(this.fields.keys());
    const otherKeys = Array.from(other.fields.keys());
    if (thisKeys.length !== otherKeys.length) {
      return false;
    }
    for (const key of thisKeys) {
      if (!other.fields.has(key)) {
        return false;
      }
      if (other.fields.get(key)?.typeCompatibleWith(this.fields.get(key)!)) {
        return false;
      }
    }
    return true;
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return this.id === kind;
  }

  isFunction(): boolean {
    return false;
  }
}

export class PlaceholderSymbolType implements SymbolType {
  reference!: Option<SymbolType>;

  constructor(params: WithOptionalAttributes<PlaceholderSymbolType>) {
    this.reference = Some(params.reference);
  }

  typeCompatibleWith(other: SymbolType): boolean {
    return this.reference
      .map((reference) => reference.typeCompatibleWith(other))
      .unwrapOr(true);
  }

  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean {
    return this.reference
      .map((reference) => reference.isPrimitive(kind))
      .unwrapOr(false);
  }

  isFunction(): boolean {
    return this.reference
      .map((reference) => reference.isFunction())
      .unwrapOr(false);
  }

  bind(to: SymbolType) {
    if (this.reference.hasValue()) {
      throw new InternalError(
        "A placeholder symbol type can only be bound to another type once.",
      );
    }
    this.reference = Some(to);
  }
}

type Scope = {
  types: Map<string, SymbolType>;
  returnType: Option<SymbolType>;
};

export class TypeTable {
  private scopes: Scope[] = [];

  constructor() {
    this.reset();
  }

  pushScope() {
    this.scopes.push({ types: new Map(), returnType: None() });
  }

  popScope() {
    this.scopes.pop();
    if (this.scopes.length === 0) {
      throw new InternalError(
        "The outermost scope of the type table has been popped.",
        "The type table always needs to consist of at least one scope.",
      );
    }
  }

  private findTypeInScope(
    name: string,
    scope: Scope,
  ): Option<SymbolType> {
    return Some(scope.types.get(name));
  }

  findTypeInCurrentScope(name: string): Option<SymbolType> {
    const current = this.scopes.at(-1);
    if (current !== undefined) {
      return this.findTypeInScope(name, current);
    }
    return None();
  }

  findType(name: string): Option<SymbolType> {
    for (const currentScope of this.scopes.toReversed()) {
      const symbolType = this.findTypeInScope(name, currentScope);
      if (symbolType.kind === "none") {
        continue;
      }
      return symbolType;
    }
    return None();
  }

  typeResolvable(name: string): boolean {
    return this.findType(name).kind === "some";
  }

  setType(name: string, symbolType: SymbolType) {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.types.set(name, symbolType);
  }

  setReturnType(returnType: SymbolType) {
    const current = this.scopes.at(-1)!;
    current.returnType = Some(returnType);
  }

  findReturnTypeInCurrentScope(): Option<SymbolType> {
    const current = this.scopes.at(-1)!;
    return current.returnType;
  }

  findReturnType(): Option<SymbolType> {
    for (const currentScope of this.scopes.toReversed()) {
      const returnType = currentScope.returnType;
      if (returnType.kind === "none") {
        continue;
      }
      return returnType;
    }
    return None();
  }

  initializeStandardLibraryTypes() {
    this.setType("Number", new CompositeSymbolType({ id: "Number" }));
    this.setType("Boolean", new CompositeSymbolType({ id: "Boolean" }));
    this.setType("String", new CompositeSymbolType({ id: "String" }));

    /* ~~~ TEMPORARY ~~~ */

    // will be replaced by stdlib implementation in the future

    this.setType("Nothing", new CompositeSymbolType({ id: "Nothing" }));

    /* ~~~ TEMPORARY ~~~ */
  }

  reset() {
    this.scopes = [];
    this.pushScope();
    this.initializeStandardLibraryTypes();
  }
}

export const typeTable = new TypeTable();
