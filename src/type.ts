import { DEVELOPER_OPTIONS } from "./execution.ts";
import { SymbolValue } from "./symbol.ts";
import { zip } from "./util/array.ts";
import { InternalError } from "./util/error.ts";
import { globalAutoincrement } from "./util/increment.ts";
import { None, Option, Some } from "./util/monad/index.ts";
import { surroundWithIfNonEmpty } from "./util/string.ts";

export type FundamentalSymbolTypeKind = "Number" | "Boolean" | "String";

/**
 * A type that allows callers of type comparisons to gain insight into why the type comparison failed.
 * For instance, this can be handy when the caller needs to provide a reason for the type mismatch in an error message.
 * An instance of this type can be passed to the type comparions.
 * The caller only needs to implement the callbacks that are of initerest to them.
 */
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

/**
 * A `SymbolType` is used to describe data types within the language.
 */
export interface SymbolType {
  /**
   * Compares this type to another type.
   * The method is supposed to be called in the following direction:
   * `suppliedType.typeCompatibleWith(expectedType)`.
   * By passing an instance of `SymbolTypeMismatchHandler`,
   * the caller can gain insight into why the type comparison failed.
   * When the compared types are part of a type hierarchy, the type
   * compatability check only succeeds in the following direction:
   * `subtype.typeCompatibleWith(supertype)`.
   */
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo?: Map<SymbolType, Set<SymbolType>>,
  ): boolean;

  /**
   * Provides a pretty-printed representation of the type that can be shown to the user.
   * In case the type is a (chain of) placeholder(s), the type is resolved first.
   */
  displayName(): string;

  /**
   * Similar to `displayName`, but only returns the name of the type without any additional information.
   * Take the following table as an example on the difference between `resolveId` and `displayName`:
   *
   * | resolveId() | displayName()       |
   * |-------------|---------------------|
   * | Function    | Function<A>(A) -> A |
   * | Bar         | Bar<T, U>           |
   * | T           | T                   |
   */
  resolveId(): string;

  /**
   * Similar to `resolveId`, but in case the type is a placeholder, does not resolve the type first.
   * For instance, in case a placeholder called `T` is bound to `Number`, `resolveId` would return `T`.
   */
  unresolvedId(): string;

  /**
   * Returns `true` in case the type (including all its subtypes) does not contain any unboud placeholders.
   */
  complete(memo?: Map<SymbolType, boolean>): boolean;

  /**
   * Returns `false` in case the type is an unbound placeholder.
   * Returns `true` in any other case.
   */
  bound(): boolean;

  /**
   * In case the type is a placeholder, allows binding it to another type.
   * This method does not have any effect if called on any other type than a placeholder.
   */
  bind(to: SymbolType): void;

  /**
   * In case the type is a chain of placeholders, returns the last type in the chain.
   * In case the type is not a placeholder, returns the type itself.
   */
  peel(): SymbolType;

  /**
   * Creates a deep copy of the type.
   */
  fork(memo?: Map<SymbolType, SymbolType>): SymbolType;

  /**
   * Whether this type represents one of the fundamental types.
   */
  isFundamental(kind: FundamentalSymbolTypeKind): boolean;

  /**
   * Whether this type represents a function type.
   */
  isFunction(): boolean;

  /**
   * Whether to ignore potential analysis findings that are caused by this type.
   */
  ignore(): boolean;
}

export class FunctionSymbolType implements SymbolType {
  parameterTypes!: SymbolType[];
  placeholders!: Map<string, PlaceholderSymbolType>;
  returnType!: SymbolType;

  constructor(params: {
    parameterTypes: SymbolType[];
    returnType: SymbolType;
    placeholders?: Map<string, PlaceholderSymbolType>;
  }) {
    params.placeholders ??= new Map();
    Object.assign(this, params);
  }

  /**
   * Invocations are only realized using positional parameters at this point.
   * Therefore, comparing the names of parameters is not necessary.
   */
  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: Partial<SymbolTypeMismatchHandler>,
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    other = other.peel();
    if (memo.get(this)?.has(other)) {
      return true;
    }
    if (!memo.has(this)) {
      memo.set(this, new Set());
    }
    if (!memo.has(other)) {
      memo.set(other, new Set());
    }
    memo.get(this)!.add(other);
    if (other instanceof IgnoreSymbolType) {
      return other.typeCompatibleWith(this, mismatchHandler, memo);
    }
    // only fork types if placeholders need to be assumed
    let self = this as FunctionSymbolType;
    if (!self.complete()) {
      const originalSelf = self;
      self = self.fork();
      memo.set(self, memo.get(originalSelf)!);
    }
    if (!other.complete()) {
      const originalOther = other;
      other = other.fork();
      memo.set(other, memo.get(originalOther)!);
      memo.get(other)!.add(self);
      memo.get(self)!.add(other);
    }
    // trivial case
    if (!(other instanceof FunctionSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: self.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    // prepare comparions of function parameters and return type
    if (other.parameterTypes.length !== self.parameterTypes.length) {
      mismatchHandler?.onFunctionParameterCountMismatch?.({
        expected: self.parameterTypes.length,
        found: other.parameterTypes.length,
      });
      return false;
    }
    for (
      const [selfParameter, otherParameter] of zip(
        [...self.parameterTypes, self.returnType],
        [...other.parameterTypes, other.returnType],
      )
    ) {
      const selfParameterBound = selfParameter.bound();
      const otherParameterBound = otherParameter.bound();
      if (!selfParameterBound && otherParameterBound) {
        selfParameter.bind(otherParameter);
      }
      if (selfParameterBound && !otherParameterBound) {
        otherParameter.bind(selfParameter);
      }
      if (!selfParameterBound && !otherParameterBound) {
        const uniqueType = new UniqueSymbolType();
        selfParameter.bind(uniqueType);
        otherParameter.bind(uniqueType);
      }
    }
    // compare function parameters
    for (
      const [selfParameter, otherParameter, index] of zip(
        self.parameterTypes,
        other.parameterTypes,
      )
    ) {
      if (
        !selfParameter.typeCompatibleWith(otherParameter, mismatchHandler, memo)
      ) {
        mismatchHandler?.onFunctionParameterTypeMismatch?.({
          index: index,
          expected: selfParameter,
          found: otherParameter,
        });
        return false;
      }
    }
    // compare return type
    if (
      !self.returnType.typeCompatibleWith(
        other.returnType,
        mismatchHandler,
        memo,
      )
    ) {
      mismatchHandler?.onFunctionReturnTypeMismatch?.({
        expected: self.returnType,
        found: other.returnType,
      });
      return false;
    }
    return true;
  }

  displayName(): string {
    const parameters = this.parameterTypes
      .map((type) => type.displayName())
      .join(" , ");
    const returnType = this.returnType.displayName();
    return `Function(${parameters}) -> ${returnType}`;
  }

  resolveId(): string {
    return "Function";
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    memo.set(this, false);
    const result = [...this.parameterTypes, this.returnType]
      .map((type) => type.complete(memo))
      .every((entry) => entry === true);
    memo.set(this, result);
    return result;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(memo = new Map<SymbolType, SymbolType>()): FunctionSymbolType {
    if (memo.has(this)) {
      return memo.get(this) as FunctionSymbolType;
    }
    const copy = new FunctionSymbolType({
      parameterTypes: [],
      returnType: new IgnoreSymbolType(),
      placeholders: new Map(),
    });
    memo.set(this, copy);
    const forkedPlaceholders = new Map<string, PlaceholderSymbolType>();
    for (const [name, type] of this.placeholders) {
      const forkedPlaceholder = type.fork(memo) as PlaceholderSymbolType;
      forkedPlaceholders.set(name, forkedPlaceholder);
    }
    const forkedParameters = this.parameterTypes
      .map((type) => type.fork(memo));
    const forkedReturnType = this.returnType.fork(memo);
    copy.parameterTypes = forkedParameters;
    copy.placeholders = forkedPlaceholders;
    copy.returnType = forkedReturnType;
    return copy;
  }

  isFundamental(): boolean {
    return false;
  }

  isFunction(): boolean {
    return true;
  }

  ignore(): boolean {
    return false;
  }
}

/**
 * Represents a user defined type that is made up of other types.
 * The individual types that make up the type as a whole are referred to as fields.
 * Each field consists of a name and a type.
 * Two instances of `CompositeSymbolType` are type compatible in case they contain
 * the same amount of field, the fields have the same names,
 * and the types for each field are type compatible themselves.
 * A `CompositeSymbolType` can contain default values for each of its fields,
 * which are only used during the instantiation of the type.
 * Default values are ignored during type comparisons.
 */
export class CompositeSymbolType implements SymbolType {
  id!: string;
  fields!: Map<string, SymbolType>;
  placeholders!: Map<string, PlaceholderSymbolType>;
  traits!: CompositeSymbolType[];

  constructor(
    params: {
      id: string;
      fields?: Map<string, SymbolType>;
      defaultValues?: Map<string, SymbolValue>;
      placeholders?: Map<string, PlaceholderSymbolType>;
      traits?: CompositeSymbolType[];
    },
  ) {
    params.fields ??= new Map();
    params.placeholders ??= new Map();
    params.defaultValues ??= new Map();
    params.traits ??= [];
    Object.assign(this, params);
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    other = other.peel();
    if (memo.get(this)?.has(other)) {
      return true;
    }
    if (!memo.has(this)) {
      memo.set(this, new Set());
    }
    memo.get(this)!.add(other);
    if (other instanceof IgnoreSymbolType) {
      return other.typeCompatibleWith(this, mismatchHandler, memo);
    }
    if (!(other instanceof CompositeSymbolType)) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.displayName(),
        found: other.displayName(),
      });
      return false;
    }
    const compatibleImplementation = this.traits
      .some((type) => {
        const memoCopy = new Map<SymbolType, Set<SymbolType>>(memo);
        return type.typeCompatibleWith(other, mismatchHandler, memoCopy);
      });
    if (compatibleImplementation) {
      return true;
    }
    if (this.id !== other.id) {
      mismatchHandler?.onIdMismatch?.({
        expected: this.displayName(),
        found: other.displayName(),
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
      if (
        !placeholderType.typeCompatibleWith(
          otherPlaceholder,
          mismatchHandler,
          memo,
        )
      ) {
        mismatchHandler?.onPlaceholderTypeMismatch?.({
          expected: placeholderType,
          found: otherPlaceholder,
          index: index,
        });
        return false;
      }
    }
    if (DEVELOPER_OPTIONS.enableSanityChecks) {
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
        if (
          !other.fields.get(key)?.typeCompatibleWith(
            this.fields.get(key)!,
            mismatchHandler,
            memo,
          )
        ) {
          throw new InternalError(
            "Encountered two CompositeSymbolTypes with matching IDs but at least one type-incompatible field.",
          );
        }
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

  resolveId(): string {
    return this.id;
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    memo.set(this, false);
    const result = Array.from(this.placeholders.entries())
      .map(([_name, type]) => type.complete(memo))
      .every((entry) => entry === true);
    memo.set(this, result);
    return result;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(
    memo = new Map<CompositeSymbolType, CompositeSymbolType>(),
  ): CompositeSymbolType {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    const copy = new CompositeSymbolType({
      id: this.id,
      fields: new Map(),
      placeholders: new Map(),
      traits: [],
    });
    memo.set(this, copy);
    const forkedPlaceholders = new Map<string, PlaceholderSymbolType>();
    for (const [name, type] of this.placeholders) {
      const forkedPlaceholder = type.fork(memo) as PlaceholderSymbolType;
      forkedPlaceholders.set(name, forkedPlaceholder);
    }
    const forkedFields = new Map<string, SymbolType>();
    for (const [name, type] of this.fields) {
      const forkedType = type.fork(memo);
      forkedFields.set(name, forkedType);
    }
    const forkedTraits = this.traits
      .map((trait) => trait.fork(memo));
    copy.fields = forkedFields;
    copy.placeholders = forkedPlaceholders;
    copy.traits = forkedTraits;
    return copy;
  }

  isFundamental(kind: FundamentalSymbolTypeKind): boolean {
    return this.id === kind;
  }

  isFunction(): boolean {
    return false;
  }

  ignore(): boolean {
    return false;
  }
}

export class PlaceholderSymbolType implements SymbolType {
  reference!: Option<SymbolType>;
  name!: string;
  rebindingAllowed!: boolean;

  constructor({
    reference,
    name,
    rebindingAllowed = false,
  }: {
    reference?: SymbolType;
    name: string;
    rebindingAllowed?: boolean;
  }) {
    this.reference = Some(reference);
    this.name = name;
    this.rebindingAllowed = rebindingAllowed;
  }

  typeCompatibleWith(
    other: SymbolType,
    mismatchHandler?: SymbolTypeMismatchHandler,
    memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    const resolvedA = this.peel();
    const resolvedB = other.peel();
    if (
      resolvedA instanceof IgnoreSymbolType ||
      resolvedB instanceof IgnoreSymbolType
    ) {
      return true;
    }
    const bothBound = resolvedA.bound() && resolvedB.bound();
    if (bothBound) {
      return resolvedA.typeCompatibleWith(resolvedB, mismatchHandler, memo);
    }
    const bothUnbound = !resolvedA.bound() && !resolvedB.bound();
    if (bothUnbound) {
      // compare the first placeholders in both chains
      const firstNameMatch = this.unresolvedId() === other.unresolvedId();
      if (firstNameMatch) {
        return true;
      }
      // compare the last placeholders in both chains
      const lastNameMatch = resolvedA.resolveId() === resolvedB.resolveId();
      if (lastNameMatch) {
        return true;
      }
    }
    mismatchHandler?.onIdMismatch?.({
      expected: resolvedA.displayName(),
      found: resolvedB.displayName(),
    });
    return false;
  }

  displayName(): string {
    return this.reference
      .map((reference) => reference.displayName())
      // Use placeholder name in case the placeholder is bound to a `UniqueSymbolType`.
      // A `UniqueSymbolType` can be recognized by its empty display name.
      .map((name) => name === "" ? undefined : name)
      .unwrapOr(this.name);
  }

  resolveId(): string {
    return this.reference
      .map((reference) => reference.resolveId())
      // Use placeholder name in case the placeholder is bound to a `UniqueSymbolType`.
      // A `UniqueSymbolType` can be recognized by its empty id.
      .map((name) => name === "" ? undefined : name)
      .unwrapOr(this.name);
  }

  unresolvedId(): string {
    return this.name;
  }

  complete(memo = new Map<SymbolType, boolean>()): boolean {
    return this.reference
      .map((reference) => reference.complete(memo))
      .unwrapOr(false);
  }

  bound(): boolean {
    return this.reference.hasValue();
  }

  bind(to: SymbolType) {
    if (this.bound() && !this.rebindingAllowed) {
      throw new InternalError(
        "A PlaceholderSymbolType can only be bound to another type once.",
      );
    }
    this.reference = Some(to);
  }

  peel(): SymbolType {
    return this.reference
      .map((reference) => reference.peel())
      .unwrapOr(this);
  }

  fork(
    memo = new Map<SymbolType, SymbolType>(),
  ): SymbolType {
    if (memo.has(this)) {
      return memo.get(this)!;
    }
    const copy = new PlaceholderSymbolType({
      name: this.name,
      rebindingAllowed: this.rebindingAllowed,
    });
    memo.set(this, copy);
    const forkedReference = this.reference
      .map((reference) => reference.fork(memo));
    copy.reference = forkedReference;
    return copy;
  }

  isFundamental(kind: FundamentalSymbolTypeKind): boolean {
    return this.reference
      .map((reference) => reference.isFundamental(kind))
      .unwrapOr(false);
  }

  isFunction(): boolean {
    return this.reference
      .map((reference) => reference.isFunction())
      .unwrapOr(false);
  }

  ignore(): boolean {
    return this.reference
      .map((reference) => reference.ignore())
      .unwrapOr(false);
  }
}

/**
 * A SymbolType that is meant to produce no side effects. For instance,
 * comparing this type to any other type will always yield `true`, which
 * should result in no type mismatches in the analysis findings (which
 * are considered side effects here).
 * It is used primarily in two scenarios. First, in case the
 * analysis of a field or a variables yields erroneous findings,
 * the type of that field or variable cannot be determined safely.
 * In this case, the type can be set to an instance of `IgnoreSymbolType`.
 * This will allow the analysis to continue even without a proper type.
 * Second, when a type contains mutually dependent fields, it not possible
 * to perform analysis on one field when its dependent field has not yet
 * been analyzed. As a solution, each field is set to an instance of
 * `IgnoreSymbolType` first, which allows an initial pass of the analysis
 * to be performed. Later, when all fields have been analyzed in the first
 * pass, the types can be replaced with the correct types. Only then can the
 * analysis. An instance of `IgnoreSymbolType` is usually paired with an
 * instance of `PlaceholderSymbolType` which acts as a mutable reference that
 * allows replacing the `IgnoreSymbolType` once the "real" type can be determined.
 */
export class IgnoreSymbolType implements SymbolType {
  typeCompatibleWith(
    _other: SymbolType,
    _mismatchHandler?: SymbolTypeMismatchHandler,
    _memo = new Map<SymbolType, Set<SymbolType>>(),
  ): boolean {
    return true;
  }

  displayName(): string {
    return "Ignore";
  }

  resolveId(): string {
    return "Ignore";
  }

  unresolvedId(): string {
    return "Ignore";
  }

  complete(): boolean {
    return true;
  }

  bound(): boolean {
    return true;
  }

  bind(): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(): SymbolType {
    return new IgnoreSymbolType();
  }

  isPrimitive(): boolean {
    return true;
  }

  isFundamental(): boolean {
    return true;
  }

  isFunction(): boolean {
    return true;
  }

  ignore(): boolean {
    return true;
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
    // Placeholders will recognize the empty name and
    // substitute it with their own name instead.
    // This is done to make sure that the name of the `UniqueSymbolType`
    // does not end up in error or log messages.
    return "";
  }

  resolveId(): string {
    // Placeholders will recognize the empty name and
    // substitute it with their own name instead.
    // This is done to make sure that the name of the `UniqueSymbolType`
    // does not end up in error or log messages.
    return "";
  }

  unresolvedId(): string {
    return this.resolveId();
  }

  complete(): boolean {
    return true;
  }

  bound(): boolean {
    return true;
  }

  bind(_to: SymbolType): void {
    return;
  }

  peel(): SymbolType {
    return this;
  }

  fork(): SymbolType {
    const copy = new UniqueSymbolType();
    copy.index = this.index;
    return copy;
  }

  isFundamental(_kind: FundamentalSymbolTypeKind): boolean {
    return false;
  }

  isFunction(): boolean {
    return false;
  }

  ignore(): boolean {
    return false;
  }
}

/**
 * Additional flags that apply to types only
 * when they areinserted into the type table.
 */
type TypeFlags = {
  /**
   * Whether the type is readonly.
   * Mainly used to protect stdlib contents from being reassigned.
   */
  readonly: boolean;
  /**
   * Whether the type is part of the standard library.
   * Usually, this flag is used in conjunction with the `readonly` flag
   * to provide a reason as to why a type cannot be reassigned.
   */
  stdlib: boolean;
};

type TypeEntry = TypeFlags & {
  type: SymbolType;
};

type Scope = {
  types: Map<string, TypeEntry>;
  returnType: Option<SymbolType>;
  /**
   * Whether the scope represents a loop.
   */
  loop: boolean;
};

export class TypeTable {
  private scopes: Scope[] = [];
  /**
   * Types that belong to the runtime are kept in a separate namespace.
   * When looking up types via their name, runtime types are considered first.
   * This behavior can be disabled by setting `ignoreRuntimeTypes` to `true`.
   */
  private runtimeTypes = new Map<string, SymbolType>();
  /**
   * When a flag is set globally as an override, it is automatically
   * applied to all types that are inserted into the table.
   * This becomes useful, for instance, when initializing the stdlib.
   * There, the `readonly` flag can be set for all types contained in the stdlib.
   * When an override is set to `"notset"`, it is not applied to any type.
   * Also, in case a flag is explicitly set when a type is inserted
   * into the table, the global flag is ignored.
   */
  private globalFlagOverrides: {
    [K in keyof TypeFlags]: TypeFlags[K] | "notset";
  } = {
    readonly: "notset",
    stdlib: "notset",
  };
  /**
   * Similar to `globalFlagOverrides`, but only applies to the current scope.
   * Scoped flags have priority over global flags, meaning if both are set,
   * the scoped flag is applied. To read the effective flag override,
   * the `getEffectiveFlagOverride` method can be used.
   */
  private scopedFlagOverrides: Array<
    {
      [K in keyof TypeFlags]: TypeFlags[K] | "notset";
    }
  > = [];
  /**
   * When set to `true`, the table will act as if types stored
   * in the `runtimeTypes` namespace do not exists.
   */
  ignoreRuntimeTypes = true;

  constructor() {
    this.reset();
  }

  /**
   * Saves the current state of the table. It should be noted that
   * the snapshot is not a deep copy of the table. Rather, only
   * the references to the types are copied. When an underlying type
   * is changed in the original table, the corresponding type in the
   * copy is also affected. To restore the state of the table to the
   * state of a snapshot, the snapshot can be passed to the `reset` method.
   */
  createSnapshot(): TypeTable {
    const snapshot = new TypeTable();
    snapshot.scopes = this.scopes.map(({ types, returnType, loop }) => ({
      types: new Map(types),
      returnType,
      loop,
    }));
    snapshot.runtimeTypes = new Map(this.runtimeTypes);
    snapshot.globalFlagOverrides = { ...this.globalFlagOverrides };
    snapshot.scopedFlagOverrides = this.scopedFlagOverrides.map((flags) => ({
      ...flags,
    }));
    snapshot.ignoreRuntimeTypes = this.ignoreRuntimeTypes;
    return snapshot;
  }

  pushScope({
    returnType = undefined,
    loop = false,
  }: {
    returnType?: SymbolType;
    loop?: boolean;
  } = {
    returnType: undefined,
    loop: false,
  }) {
    this.scopes.push({
      types: new Map(),
      returnType: Some(returnType),
      loop,
    });
    this.scopedFlagOverrides.push({ readonly: "notset", stdlib: "notset" });
  }

  popScope() {
    this.scopes.pop();
    this.scopedFlagOverrides.pop();
    if (this.scopes.length === 0) {
      throw new InternalError(
        "The outermost scope of the type table has been popped.",
        "The type table always needs to consist of at least one scope.",
      );
    }
  }

  private findTypeEntryInScope(
    name: string,
    scope: Scope,
  ): Option<TypeEntry> {
    return Some(scope.types.get(name));
  }

  findTypeInCurrentScope(name: string): Option<[SymbolType, TypeFlags]> {
    if (!this.ignoreRuntimeTypes) {
      const runtimeType = this.runtimeTypes.get(name);
      if (runtimeType !== undefined) {
        return Some([runtimeType, { readonly: true, stdlib: false }]);
      }
    }
    const current = this.scopes.at(-1);
    if (current !== undefined) {
      return this.findTypeEntryInScope(name, current)
        .map((entry) => {
          const { type, ...flags } = entry;
          return [type, flags];
        });
    }
    return None();
  }

  findType(name: string): Option<[SymbolType, TypeFlags]> {
    if (!this.ignoreRuntimeTypes) {
      const runtimeType = this.runtimeTypes.get(name);
      if (runtimeType !== undefined) {
        return Some([runtimeType, { readonly: true, stdlib: false }]);
      }
    }
    for (const currentScope of this.scopes.toReversed()) {
      const typeEntry = this.findTypeEntryInScope(name, currentScope)
        .map((entry) => {
          const { type, ...flags } = entry;
          return [type, flags];
        });
      if (!typeEntry.hasValue()) {
        continue;
      }
      return typeEntry as Option<[SymbolType, TypeFlags]>;
    }
    return None();
  }

  setRuntimeType(name: string, symbolType: SymbolType) {
    this.runtimeTypes.set(name, symbolType);
  }

  setLoop(loop: boolean) {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.loop = loop;
  }

  typeResolvable(name: string): boolean {
    return this.findType(name).hasValue();
  }

  setType(
    name: string,
    symbolType: SymbolType,
    flags: Partial<TypeFlags> = {},
  ) {
    const currentScope = this.scopes[this.scopes.length - 1];
    const currentScopeIndex = this.scopes.length - 1;
    const existingEntry = Some(currentScope.types.get(name));
    existingEntry.then((entry) => {
      if (entry.readonly) {
        throw new InternalError(
          `Attempted to reassign the existing type with the name "${name}".`,
          `However, the type is flagged as readonly.`,
        );
      }
    });
    const entry: TypeEntry = {
      type: symbolType,
      readonly: flags.readonly ??
        this.getEffectiveFlagOverride("readonly", currentScopeIndex),
      stdlib: flags.stdlib ??
        this.getEffectiveFlagOverride("stdlib", currentScopeIndex),
    };
    currentScope.types.set(name, entry);
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

  /**
   * Returns `true` in case the current scope is a loop.
   */
  currentScopeIsLoop(): boolean {
    const currentScope = this.scopes.at(-1);
    return currentScope?.loop ?? false;
  }

  /**
   * Returns `true` in case the current or any of
   * the parent scopes represent a loop.
   */
  insideLoop(): boolean {
    for (const currentScope of this.scopes.toReversed()) {
      if (currentScope.loop) {
        return true;
      }
    }
    return false;
  }

  initializeStandardLibraryTypes() {
    this.setType(
      "Number",
      new CompositeSymbolType({ id: "Number" }),
      { readonly: true },
    );
    this.setType(
      "Boolean",
      new CompositeSymbolType({ id: "Boolean" }),
      { readonly: true },
    );
    this.setType(
      "String",
      new CompositeSymbolType({ id: "String" }),
      { readonly: true },
    );

    // The `Nothing` is initialized in the stdlib. However, to initialize the
    // runtime bindings (which happens before the stdlib can be loaded),
    // the `Nothing` type already needs to be present in the type table.
    // Therefore, the type is created temporarily and is later overriden
    // by the `Nothing` type from the stdlib. To allow overriding the type,
    // the `readonly` flag is set to `false`.
    this.setType(
      "Nothing",
      new CompositeSymbolType({
        id: "Nothing",
        placeholders: new Map([
          ["T", new PlaceholderSymbolType({ name: "T" })],
        ]),
      }),
      { readonly: false },
    );
  }

  /**
   * Resets the type table to its initial state. However, if a snapshot is
   * provided, the type table is reset to the state of the snapshot instead.
   */
  reset(
    snapshot?: TypeTable,
  ) {
    if (snapshot !== undefined) {
      this.scopes = snapshot.scopes;
      this.runtimeTypes = snapshot.runtimeTypes;
      this.globalFlagOverrides = snapshot.globalFlagOverrides;
      this.scopedFlagOverrides = snapshot.scopedFlagOverrides;
      this.ignoreRuntimeTypes = snapshot.ignoreRuntimeTypes;
      return;
    }
    this.scopes = [];
    this.scopedFlagOverrides = [];
    this.pushScope();
    this.initializeStandardLibraryTypes();
  }

  /**
   * See the `globalFlagOverrides` attribute for more information.
   */
  private getGlobalFlagOverride(
    flag: keyof TypeFlags,
  ): TypeFlags[keyof TypeFlags] {
    const override = this.globalFlagOverrides[flag];
    if (override === "notset") {
      return false;
    }
    return override;
  }

  /**
   * Resolves the effective flag for the given scope index, applying precedence:
   * scoped overrides > global overrides.
   */
  private getEffectiveFlagOverride(
    flag: keyof TypeFlags,
    scopeIndex: number,
  ): TypeFlags[keyof TypeFlags] {
    const scoped = this.scopedFlagOverrides[scopeIndex]?.[flag] ?? "notset";
    if (scoped === "notset") {
      return this.getGlobalFlagOverride(flag);
    }
    return scoped;
  }

  /**
   * When a flag is set globally as an override, that flag is automatically
   * applied to all symbols that are inserted into the table.
   * Look at the `globalFlagOverrides` attribute for more information.
   */
  setGlobalFlagOverrides(
    flags: { [K in keyof TypeFlags]?: TypeFlags[K] | "notset" },
  ) {
    for (const [key, value] of Object.entries(flags)) {
      this.globalFlagOverrides[key as keyof TypeFlags] = value;
    }
  }

  /**
   * Sets flag overrides for the current scope only. See
   * `setGlobalFlagOverrides` for more information.
   */
  setScopedFlagOverrides(
    flags: { [K in keyof TypeFlags]?: TypeFlags[K] | "notset" },
  ) {
    const idx = this.scopedFlagOverrides.length - 1;
    const current = this.scopedFlagOverrides[idx];
    for (const [key, value] of Object.entries(flags)) {
      current[key as keyof TypeFlags] = value as
        | TypeFlags[keyof TypeFlags]
        | "notset";
    }
  }
}
