import { InternalError } from "../error.ts";
import { Err, Ok, Result } from "./index.ts";

export interface Option<T> {
  kind: "some" | "none";
  hasValue(): boolean;
  map<U>(fn: (value: T) => U | undefined): Option<U>;
  flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  orErr<E>(err: E): Result<T, E>;
  or(alternative: Option<T>): Option<T>;
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
  unwrapOrThrow(error: Error): T;
  then(fn: (value: T) => void): Option<T>;
  onNone(fn: () => void): Option<T>;
  zip<U>(other: Option<U>): Option<[T, U]>;
  iter(): T[];
  dependsOn(dependency: Option<unknown>): Option<T>;
}

export function Some<T>(value: T | undefined): Option<T> {
  if (value === undefined || value === null) {
    return None();
  }

  return {
    kind: "some",

    hasValue(): boolean {
      return true;
    },

    map<U>(fn: (value: T) => U | undefined): Option<U> {
      return Some(fn(value));
    },

    flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
      return fn(value);
    },

    orErr<E>(_err: E): Result<T, E> {
      return Ok(value);
    },

    or(_alternative: Option<T>): Option<T> {
      return this;
    },

    unwrap(): T {
      return value;
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },

    unwrapOrThrow(_error: Error): T {
      return value;
    },

    then(fn): Option<T> {
      fn(value);
      return this;
    },

    onNone(_fn: () => void): Option<T> {
      return this;
    },

    zip<U>(other: Option<U>): Option<[T, U]> {
      if (other.kind === "some") {
        return Some([value, other.unwrap()]);
      }
      return None();
    },

    iter(): T[] {
      return [value];
    },

    dependsOn(dependency: Option<unknown>): Option<T> {
      if (dependency.kind === "some") {
        return this;
      }
      return None();
    },
  };
}

export function None<T>(): Option<T> {
  return {
    kind: "none",

    hasValue(): boolean {
      return false;
    },

    map<U>(_fn: (value: T) => U | undefined): Option<U> {
      return None();
    },

    flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
      return None();
    },

    orErr<E>(err: E): Result<T, E> {
      return Err(err);
    },

    or(alternative: Option<T>): Option<T> {
      return alternative;
    },

    unwrap(): T {
      throw new InternalError("Unwrap called on None object");
    },

    unwrapOr(defaultValue: T): T {
      return defaultValue;
    },

    unwrapOrThrow(error: Error): T {
      throw error;
    },

    then(_fn): Option<T> {
      return this;
    },

    onNone(fn: () => void): Option<T> {
      fn();
      return this;
    },

    zip<U>(_other: Option<U>): Option<[T, U]> {
      return None();
    },

    iter(): T[] {
      return [];
    },

    dependsOn(_dependency: Option<unknown>): Option<T> {
      return None();
    },
  };
}
