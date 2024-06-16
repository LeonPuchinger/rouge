import { CompositeSymbolValue } from "../symbol.ts";
import { typeTable } from "../type.ts";
import { InternalError } from "./error.ts";
import { Option } from "./monad/index.ts";

/**
 * Omits all properties of a type that are functions.
 */
type OmitFunctions<T> = {
  // deno-lint-ignore ban-types
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

/**
 * Omits all properties of a type that implement `Option`.
 */
type OmitOptions<T> = {
  [K in keyof T as T[K] extends Option<unknown> ? never : K]: T[K];
};

/**
 * Omits all properties of a type that *don't* implement `Option`.
 */
type OnlyOptions<T> = {
  [K in keyof T as T[K] extends Option<unknown> ? K : never]: T[K];
};

/**
 * Convert all properties of a type that implement `Option<T>`
 * to be of type `T` and mark them as truly optional.
 */
type ConvertOptionals<T> =
  & {
    [K in keyof OnlyOptions<T>]?: T[K] extends Option<infer S> ? S : never;
  }
  & OmitOptions<T>;

/**
 * Generate a type from all public members of a class (excluding methods).
 */
export type Attributes<T> = OmitFunctions<T>;

export type WithOptionalAttributes<T> = ConvertOptionals<Attributes<T>>;

/**
 * The `Nothing` type from the standard library.
 */
export const nothingType = typeTable
  .findType("Nothing")
  .unwrapOrThrow(
    new InternalError(
      "The type called `Nothing` from the standard library could not be located.",
      "This type is required for basic language functionality.",
    ),
  );

/**
 * An instance of the `Nothing` type from the standard library.
 */
export const nothingInstance = new CompositeSymbolValue({});
