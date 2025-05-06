import { InternalError } from "../error.ts";
import { None, Option, Some } from "./index.ts";

export interface Result<T, E> {
  kind: "ok" | "err";
  map<U>(fn: (value: T) => U): Result<U, E>;
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  mapError<U>(fn: (value: E) => U): Result<T, U>;
  flatMapError<U>(fn: (value: E) => Result<T, U>): Result<T, U>;
  ok(): Option<T>;
  err(): Option<E>;
  unwrap(): T;
  unwrapError(): E;
  unwrapOr(defaultValue: T): T;
  unwrapErrorOr(defaultValue: E): E;
  then(fn: (value: T) => void): void;
  thenError(fn: (error: E) => void): void;
  combine<U>(other: Result<U, E>): Result<[T, U], E>;
  combineError(other: Result<unknown, E>): Option<E>;
  zip<U, UE>(other: Result<U, UE>): Result<[T, U], [Option<E>, Option<UE>]>;
}

export function Ok<T, E>(value: T): Result<T, E> {
  return {
    kind: "ok",

    map<U>(fn: (value: T) => U): Result<U, E> {
      return Ok(fn(value));
    },

    flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
      return fn(value);
    },

    mapError<U>(_fn: (value: E) => U): Result<T, U> {
      return Ok(value);
    },

    flatMapError<U>(_fn: (value: E) => Result<T, U>): Result<T, U> {
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
      throw new InternalError("unwrapError called on Ok");
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

    combine<U>(other: Result<U, E>): Result<[T, U], E> {
      if (other.kind === "err") {
        return Err(other.unwrapError());
      }
      return Ok([this.unwrap(), other.unwrap()]);
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

    flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
      return Err(value);
    },

    mapError<U>(fn: (value: E) => U): Result<T, U> {
      return Err(fn(value));
    },

    flatMapError<U>(fn: (value: E) => Result<T, U>): Result<T, U> {
      return fn(value);
    },

    ok(): Option<T> {
      return None();
    },

    err(): Option<E> {
      return Some(value);
    },

    unwrap(): T {
      throw new InternalError("unwrap called on Err");
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

    combine<U>(_other: Result<U, E>): Result<[T, U], E> {
      return Err(this.unwrapError());
    },

    combineError(_other: Result<unknown, E>): Option<E> {
      return this.err();
    },

    zip<U, UE>(other: Result<U, UE>): Result<[T, U], [Option<E>, Option<UE>]> {
      return Err([this.err(), other.err()]);
    },
  };
}
