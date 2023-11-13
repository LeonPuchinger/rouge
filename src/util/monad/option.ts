import { Panic } from "../error.ts";

export interface Option<T> {
  kind: "some" | "none";
  map<U>(fn: (value: T) => U): Option<U>;
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
  then(fn: (value: T) => void): void;
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

    unwrap(): T {
      return value;
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },

    then(fn) {
      fn(value);
    },
  };
}

export function None<T>(): Option<T> {
  return {
    kind: "none",

    map<U>(_fn: (value: T) => U): Option<U> {
      return None();
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
  };
}
