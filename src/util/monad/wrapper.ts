/**
 * Wraps any value and allows performing monadic operations on that value.
 * Typescript does not allow control flow elements like switches, loops or conditions to be evaluated.
 * However, this could be used to turn switches, loops or conditions into expressions, for instance.
 *
 * Example:
 *
 * const result = new Wrapper(5)
 *  .map((contents) => {
 *    if (contents > 4) {
 *      return true;
 *    }
 *    return false;
 *  }).unwrap();
 */
export class Wrapper<T> {
  value: T;

  /**
   * @param value The value to wrap
   */
  constructor(value: T) {
    this.value = value;
  }

  /**
   * Apply an operation to the contained value.
   */
  map<U>(fn: (value: T) => U): Wrapper<U> {
    return new Wrapper(fn(this.value));
  }

  /**
   * Allow using the contained value without making any modifications to it.
   */
  then(fn: (value: T) => void): Wrapper<T> {
    fn(this.value);
    return this;
  }

  /**
   * Get back access to the contained value.
   */
  unwrap(): T {
    return this.value;
  }
}
