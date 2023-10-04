export type Option<T> = { kind: 'some'; value: T } | { kind: 'none' };

export function some<T>(value: T): Option<T> {
  return { kind: 'some', value };
}

export function none<T>(): Option<T> {
  return { kind: 'none' };
}

export function map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  return option.kind === 'some' ? some(fn(option.value)) : none();
}

export function unwrapOr<T>(option: Option<T>, defaultValue: T): T {
  return option.kind === 'some' ? option.value : defaultValue;
}

// alternative implementation
// operations on Option(al) can be called as methods
// TODO: get rid of new keyword when instantiating a new Option(al)

interface Optional<T> {
  map<U>(fn: (value: T) => U): Optional<U>;
}

export class Some<T> implements Optional<T> {
  constructor(
    public value: T,
  ) {}

  map<U> (fn: (value: T) => U): Optional<U> {
    return new Some(fn(this.value));
  }
}

export class None<T> implements Optional<T> {
  map<U> (_fn: (value: T) => U): Optional<U> {
    return new None() as Optional<U>;
  }
}
