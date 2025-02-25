import { InternalError } from "./error.ts";

export function range(n: number, m: number): number[] {
  const result = [];
  for (let i = n; i <= m; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Removes all elements that are equal to `remove` from the given array.
 * Returns a copy of the original array with the relevant items removed.
 */
export function removeAll<T>(array: T[], remove: T): T[] {
  const filtered: T[] = [];
  for (const element of array) {
    if (element !== remove) {
      filtered.push(element);
    }
  }
  return filtered;
}

/**
 * Locates all duplicates in an array. Duplicates are returned as a map
 * where each duplicate input is mapped to an array of indices where they occur.
 *
 * Example:
 *
 * input: [1, 2, 3, 1, 2, 4, 2]
 * output: Map { 1 => [0, 3], 2 => [1, 4, 6] }
 */
export function findDuplicates<T>(array: T[]): Map<T, number[]> {
  const ocurrences = new Map<T, number[]>();
  for (const [index, item] of array.entries()) {
    const locations = ocurrences.get(item) ?? [];
    ocurrences.set(item, [...locations, index]);
  }
  const duplicates = new Map<T, number[]>(
    Array.from(ocurrences.entries()).filter(([, indices]) =>
      indices.length > 1
    ),
  );
  return duplicates;
}

declare global {
  interface Array<T> {
    /**
     * Maps every element of an array using a callback function until a condition is met.
     * Returns the last mapped element.
     *
     * @param fn Maps each element from type T to type U
     * @param condition The mapping is stopped when this condition is met
     * @param defaultValue The value that is returned in case the condition is never met
     */
    mapUntil<U>(
      fn: (item: T) => U,
      condition: (result: U) => boolean,
      defaultValue: U,
    ): U;

    /**
     * Returns the first element in the array.
     * In case the array is empty, return `undefined`.
     */
    first(): T;

    /**
     * Returns the last element in the array.
     * In case the array is empty, return `undefined`.
     */
    last(): T;
  }
}

Array.prototype.mapUntil = function <T, U>(
  fn: (item: T) => U,
  condition: (result: U) => boolean,
  defaultValue: U,
): U {
  for (const item of this) {
    const result = fn(item);
    if (condition(result)) {
      return result;
    }
  }
  return defaultValue;
};

Array.prototype.first = function <T>(): T {
  return this.at(0);
};

Array.prototype.last = function <T>(): T {
  return this.slice(-1).at(0);
};

/**
 * Combines two arrays into a new array so that each entry in the new array
 * contains a tuple of the two corresponding values of the input arrays as well as an index.
 * The size of the new array equals the size of the shorter input array.
 */
export function zip<T, U>(a: T[], b: U[]): [T, U, number][] {
  const shortestArrayLength = Math.min(a.length, b.length);
  const trimmedA = a.slice(0, shortestArrayLength);
  return trimmedA.map((item, index) => [item, b[index], index]);
}

/**
 * A queue with a fixed size that removes the oldest element when full.
 */
export class FixedSizeQueue<T> {
  private queue: T[] = [];

  constructor(private maxSize: number) {
    if (this.maxSize <= 0) {
      throw new InternalError(
        "The max. size of a FixedSizeQueue must be greater than 0",
      );
    }
  }

  /**
   * Adds an element to the queue. If the queue is full, the oldest element is removed.
   */
  enqueue(item: T): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }
    this.queue.push(item);
  }

  /**
   * Removes and returns the oldest element from the queue.
   */
  dequeue(): T | undefined {
    return this.queue.shift();
  }

  /**
   * Returns the oldest element from the queue without removing it.
   */
  peek(): T | undefined {
    return this.queue[0];
  }

  /**
   * Replaces the element at the given index with a new value.
   * The index can be negative to access elements starting
   * from the end of the queue.
   */
  edit(index: number, newValue: T): void {
    const distance = index < 0 ? (-1 * index) - 1 : index;
    if (distance >= this.queue.length) {
      throw new InternalError(
        `The FixedSizeQueue does not have an element at index ${index}`,
      );
    }
    if (index < 0) {
      index = this.queue.length - distance - 1;
    }
    this.queue[index] = newValue;
  }

  get(index: number): T | undefined {
    const distance = index < 0 ? (-1 * index) - 1 : index;
    if (distance >= this.queue.length) {
      throw new InternalError(
        `The FixedSizeQueue does not have an element at index ${index}`,
      );
    }
    if (index < 0) {
      return this.queue[this.queue.length - distance - 1];
    }
    return this.queue[index];
  }

  size(): number {
    return this.queue.length;
  }

  isFull(): boolean {
    return this.queue.length === this.maxSize;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Returns the array of elements in the queue without copying it.
   */
  underlyingElements(): T[] {
    return this.queue;
  }

  /**
   * Returns a copy of the array of elements in the queue.
   */
  copyUnderlyingElements(): T[] {
    return [...this.queue];
  }
}
