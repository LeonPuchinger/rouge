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

interface Optional<T> {
  map<U>(fn: (value: T) => U): Optional<U>;
}

export function Some<T>(value: T): Optional<T> {
  return {
    map: function<U> (fn: (value: T) => U): Optional<U> {
      return Some(fn(value));
    }
  }
}

export function None<T>(): Optional<T> {
  return {
    map: function<U> (_fn: (value: T) => U): Optional<U> {
      return None() as Optional<U>;
    }
  }
}
