import { InternalError } from "./util/error.ts";
import { globalAutoincrement } from "./util/increment.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { surroundWithIfNonEmpty } from "./util/string.ts";
import { Attributes, WithOptionalAttributes } from "./util/type.ts";

type PrimitiveSymbolTypeKind = "Number" | "Boolean" | "String";

interface SymbolTypeMismatchHandler {
  onIdMismatch?(params: { expected: string; found: string }): void;
  onFunctionReturnTypeMismatch?(params: {
    expected: SymbolType;
    found: SymbolType;
  }): void;
  onFunctionParameterCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onFunctionParameterTypeMismatch?(params: {
    expected: SymbolType;
    found: SymbolType;
    index: number;
  }): void;
  onPlaceholderCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onPlaceholderNameMissing?(params: { expected: string }): void;
  onPlaceholderTypeMismatch?(
    params: {
      expected: SymbolType;
      found: SymbolType;
      index: number;
    },
  ): void;
  onFieldCountMismatch?(params: {
    expected: number;
    found: number;
  }): void;
  onFieldNameMissing?(params: { expected: string }): void;
  onFieldTypeMismatch?(
    params: {
      expected: SymbolType;
      found: SymbolType;
      index: number;
    },
  ): void;
}

export interface SymbolType {
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean;
  displayName(): string;
  complete(): boolean;
  fork(bindPlaceholders?: SymbolType[]): SymbolType;
  isPrimitive(kind: PrimitiveSymbolTypeKind): boolean;
  isFunction(): boolean;
}

export class FunctionSymbolType implements SymbolType {
  parameterTypes!: SymbolType[];
  returnType!: SymbolType;

  constructor(params: Attributes<FunctionSymbolType>) {
    Object.assign(this, params);
  }

  /**
   * Invocations are only realized using positional parameters at this point.
   * Therefore, comparing the names of parameters is not necessary.
   */
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: Partial<SymbolTypeMismatchHandler>,
  ): boolean {
    if (!(other instanceof FunctionSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    const matchingReturnTypes = other.returnType
      .typeCompatibleWith(this.returnType);
    if (!matchingReturnTypes) {
      mismatchHandler?.onFunctionReturnTypeMismatch?.({
        expected: this.returnType,
        found: other.returnType,
      });
      return false;
    }
    if (other.parameterTypes.length !== this.parameterTypes.length) {
      mismatchHandler?.onFunctionParameterCountMismatch?.({
        expected: this.parameterTypes.length,
        found: other.parameterTypes.length,
      });
      return false;
    }
    return this.parameterTypes.reduce(
      (previous, current, index) => {
        const thisType = current;
        const otherType = other.parameterTypes.at(index)!;
        const matching = thisType.typeCompatibleWith(otherType);
        if (!matching) {
          mismatchHandler?.onFunctionParameterTypeMismatch?.({
            expected: thisType,
            found: otherType,
            index: index,
          });
        }
        if (previous === false) {
          return false;
        }
        return matching;
      },
      true,
    );
  }

  displayName(): string {
    const parameters = this.parameterTypes
      .map((type) => type.displayName())
      .join(" , ");
    const returnType = this.returnType.displayName();
    return `Function(${parameters}) -> ${returnType}`;
  }

  complete(): boolean {
    return this.parameterTypes
      .map((type) => type.complete())
      .every((entry) => entry === true);
  }

  fork(_bindPlaceholders?: SymbolType[]): FunctionSymbolType {
    return new FunctionSymbolType({
      parameterTypes: this.parameterTypes.map((type) => type.fork()),
      returnType: this.returnType.fork(),
    });
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

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    if (!(other instanceof CompositeSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.id,
        // The only other possible SymbolType is FunctionSymbolType
        // since PlaceholderSymbolType only delegates to a Composite- or FunctionSymbolType.
        found: "Function",
      });
      return false;
    }
    if (this.id !== other.id) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.id,
        found: other.id,
      });
      return false;
    }
    if (this.placeholders.size !== other.placeholders.size) {
      mismatchHandler?.onPlaceholderCountMismatch?.({
        expected: this.placeholders.size,
        found: other.placeholders.size,
      });
      return false;
    }
    const placeholderNames = Array.from(this.placeholders.keys());
    const placeholderTypes = Array.from(this.placeholders.values());
    const placeholderIndicies = Array.from(
      placeholderNames,
      (_, index) => index,
    );
    for (const index of placeholderIndicies) {
      const placeholderName = placeholderNames[index];
      const placeholderType = placeholderTypes[index];
      const otherPlaceholder = other.placeholders.get(placeholderName);
      if (otherPlaceholder === undefined) {
        mismatchHandler?.onPlaceholderNameMissing?.({
          expected: placeholderType.name,
        });
        return false;
      }
      if (!placeholderType.typeCompatibleWith(otherPlaceholder)) {
        mismatchHandler?.onPlaceholderTypeMismatch?.({
          expected: placeholderType,
          found: otherPlaceholder,
          index: index,
        });
        return false;
      }
    }
    const thisKeys = Array.from(this.fields.keys());
    const otherKeys = Array.from(other.fields.keys());
    if (thisKeys.length !== otherKeys.length) {
      throw new InternalError(
        "Encountered two CompositeSymbolTypes with matching IDs but different amounts of fields.",
      );
    }
    for (const key of thisKeys) {
      if (!other.fields.has(key)) {
        throw new InternalError(
          "Encountered two CompositeSymbolTypes with matching IDs but different names for their fields.",
        );
      }
      if (!other.fields.get(key)?.typeCompatibleWith(this.fields.get(key)!)) {
        throw new InternalError(
          "Encountered two CompositeSymbolTypes with matching IDs but at least one type-incompatible field.",
        );
      }
    }
    return true;
  }

  displayName(): string {
    const placeholders = Array.from(this.placeholders.values())
      .map((type) => type.displayName())
      .join(" , ");
    return `${this.id}${surroundWithIfNonEmpty(placeholders, "<", ">")}`;
  }

  complete(): boolean {
    return Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.complete())
      .every((entry) => entry === true);
  }

  fork(bindPlaceholders?: SymbolType[]): CompositeSymbolType {
    if (bindPlaceholders && bindPlaceholders.length > this.placeholders.size) {
      throw new InternalError(
        "Tried to bind more placeholders on a type than available.",
        `Available: ${this.placeholders.size}, Supplied: ${bindPlaceholders.length}.`,
      );
    }
    bindPlaceholders ??= [];
    const copy = new CompositeSymbolType({
      id: this.id,
      fields: new Map(),
      placeholders: new Map(),
    });
    for (const [fieldName, field] of this.fields) {
      copy.fields.set(fieldName, field.fork());
    }
    const placeholderNames = Array.from(this.placeholders.keys());
    bindPlaceholders.forEach((bindTo, index) => {
      const placeholderName = placeholderNames.at(index)!;
      const placeholder = this.placeholders.get(placeholderName)!;
      placeholder.bind(bindTo);
    });
    return copy;
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
  name!: string;

  constructor(params: WithOptionalAttributes<PlaceholderSymbolType>) {
    this.reference = Some(params.reference);
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    return this.reference
      .map((reference) => reference.typeCompatibleWith(other, mismatchHandler))
      .unwrapOr(true);
  }

  displayName(): string {
    return this.reference
      .map((reference) => reference.displayName())
      .unwrapOr(this.name);
  }

  complete(): boolean {
    return this.reference
      .map((reference) => reference.complete())
      .unwrapOr(false);
  }

  fork(bindPlaceholders?: SymbolType[]): SymbolType {
    bindPlaceholders ??= [];
    const forkedReference = this.reference
      .map((reference) => reference.fork(bindPlaceholders));
    return new PlaceholderSymbolType({
      name: this.name,
      reference: forkedReference.hasValue()
        ? forkedReference.unwrap()
        : undefined,
    });
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
    if (this.isBound()) {
      throw new InternalError(
        "A PlaceholderSymbolType can only be bound to another type once.",
      );
    }
    return new PlaceholderSymbolType({
      name: this.name,
      reference: to,
    });
  }

  isBound(): boolean {
    return this.reference.hasValue();
  }
}

/**
 * A SymbolType that is only used during type comparisons of other SymbolTypes.
 * This SymbolType contains an index that that is uniquely assigned to each instance during its instantiation.
 * When two instances of this type are compared, they are considered equal in case their indices are equal.
 * The only way two instances can have the same index is when one instance is forked.
 *
 * Usually, when two types are compared and one of them is a placeholder, the placeholder is bound to the other type.
 * However, this approach cannot be used when both types are placeholders, in which case a `UniqueSymbolType` is used.
 * Consider the following two function types that are being compared, where `T` and `Y` are placeholders.
 * (It should be noted that the notation of the function types is used for demonstration purposes only
 * and is not syntactically valid in the language.)
 *
 * A: `Function(T) -> T`
 * B: `Function(Y) -> Y`
 *
 * During the type comparison, `T` and `Y` are` bound to the same instance of `UniqueSymbolType` when they are first encountered.
 * The next time either one of the placeholders are encountered, the bound instance is used for comparison.
 * In the above example, the comparison of the return types would yield `true` since both `T` and `Y` are bound to the same instance of `UniqueSymbolType`.
 */
export class UniqueSymbolType implements SymbolType {
  index!: number;

  constructor() {
    this.index = globalAutoincrement();
  }

  typeCompatibleWith(
    other: SymbolType,
    _mismatchHandler?: SymbolTypeMismatchHandler,
  ): boolean {
    if (!(other instanceof UniqueSymbolType)) {
      return false;
    }
    return this.index === other.index;
  }

  displayName(): string {
    return `UniqueSymbolType(${this.index})`;
  }

  complete(): boolean {
    return true;
  }

  fork(_bindPlaceholders?: SymbolType[]): SymbolType {
    const copy = new UniqueSymbolType();
    copy.index = this.index;
    return copy;
  }

  isPrimitive(_kind: PrimitiveSymbolTypeKind): boolean {
    return false;
  }

  isFunction(): boolean {
    return false;
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
