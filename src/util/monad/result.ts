import { Panic } from "../error.ts";
import { None, Option, Some } from "./index.ts";

export interface Result<T, E> {
  kind: "ok" | "err";
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapError<U>(fn: (value: E) => U): Result<T, U>;
  ok(): Option<T>;
  err(): Option<E>;
  unwrap(): T;
  unwrapError(): E;
  unwrapOr(defaultValue: T): T;
  unwrapErrorOr(defaultValue: E): E;
  then(fn: (value: T) => void): void;
  thenError(fn: (error: E) => void): void;
  combineError(other: Result<unknown, E>): Option<E>;
  zip<U, UE>(other: Result<U, UE>): Result<[T, U], [Option<E>, Option<UE>]>;
}

export function Ok<T, E>(value: T): Result<T, E> {
  return {
    kind: "ok",

    map<U>(fn: (value: T) => U): Result<U, E> {
      return Ok(fn(value));
    },

    mapError<U>(_fn: (value: E) => U): Result<T, U> {
      return Ok(value);
    },

    ok(): Option<T> {
      return Some(value);
    },

    err(): Option<E> {
      return None();
    },

    unwrap(): T {
      return value;
    },

    unwrapError(): E {
      throw Panic("unwrapError called on Result");
    },

    unwrapOr(_defaultValue: T): T {
      return value;
    },

    unwrapErrorOr(defaultValue: E): E {
      return defaultValue;
    },

    then(fn) {
      fn(value);
    },

    thenError(_fn) {
      // do nothing
    },

    combineError(other: Result<unknown, E>): Option<E> {
      return other.err();
    },

    zip<U, UE>(other: Result<U, UE>): Result<[T, U], [Option<E>, Option<UE>]> {
      if (other.kind === "ok") {
        return Ok([value, other.unwrap()]);
      }
      return Err([None(), other.err()]);
    },
  };
}

export function Err<T, E>(value: E): Result<T, E> {
  return {
    kind: "err",

    map<U>(_fn: (value: T) => U): Result<U, E> {
      return Err(value);
    },

    mapError<U>(fn: (value: E) => U): Result<T, U> {
      return Err(fn(value));
    },

    ok(): Option<T> {
      return None();
    },

    err(): Option<E> {
      return Some(value);
    },

    unwrap(): T {
      throw Panic("unwrap called on Err");
    },

    unwrapError(): E {
      return value;
    },

    unwrapOr(defaultValue: T): T {
      return defaultValue;
    },

    unwrapErrorOr(_defaultValue: E): E {
      return value;
    },

    then(_fn) {
      // do nothing
    },

    thenError(fn) {
      fn(value);
    },

    combineError(_other: Result<unknown, E>): Option<E> {
      return this.err();
    },

    zip<U, UE>(other: Result<U, UE>): Result<[T, U], [Option<E>, Option<UE>]> {
      return Err([this.err(), other.err()]);
    },
  };
}
