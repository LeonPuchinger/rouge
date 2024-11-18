/**
 * Generates globally unique numbers (in regard of the process),
 * starting from 0 by incrementing an internal counter.
 */
export const globalAutoincrement = function () {
  let counter = 0;

  return function () {
    const temp = counter;
    counter += 1;
    return temp;
  };
}();
