import { Panic } from "../error.ts";
import { Err, Ok, Result } from "./index.ts";

export interface Option<T> {
  kind: "some" | "none";
  map<U>(fn: (value: T) => U): Option<U>;
  ok_or<E>(err: E): Result<T, E>;
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
  then(fn: (value: T) => void): void;
  zip<U>(other: Option<U>): Option<[T, U]>;
}

export function Some<T>(value: T | undefined): Option<T> {
  if (value === undefined || value === null) {
    return None();
  }

  return {
    kind: "some",

    map<U>(fn: (value: T) => U): Option<U> {
      return Some(fn(value));
    },

    ok_or<E>(_err: E): Result<T, E> {
      return Ok(value);
    },

    unwrap(): T {
      return value;
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },

    then(fn) {
      fn(value);
    },

    zip<U>(other: Option<U>): Option<[T, U]> {
      if (other.kind === "some") {
        return Some([value, other.unwrap()]);
      }
      return None();
    },
  };
}

export function None<T>(): Option<T> {
  return {
    kind: "none",

    map<U>(_fn: (value: T) => U): Option<U> {
      return None();
    },

    ok_or<E>(err: E): Result<T, E> {
      return Err(err);
    },

    unwrap(): T {
      throw Panic("Unwrap called on None object");
    },

    unwrapOr(defaultValue: T): T {
      return defaultValue;
    },

    then(_fn) {
      // do nothing
    },

    zip<U>(_other: Option<U>): Option<[T, U]> {
      return None();
    },
  };
}
