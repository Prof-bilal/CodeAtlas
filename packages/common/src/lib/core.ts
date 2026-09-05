/**
 * Least Common Multiple (LCM) utility functions.
 * These functions compute the least common multiple of numbers.
 */

/**
 * Computes the LCM of exactly two numbers.
 */
export function lcmTwo(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return (Math.abs(a) * Math.abs(b)) / gcdTwo(Math.abs(a), Math.abs(b));
}

/**
 * Computes the greatest common divisor of two numbers using the Euclidean algorithm.
 */
function gcdTwo(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Computes the LCM of a variable number of arguments.
 * Returns the single value when given one argument.
 * Always returns a positive value.
 */
export function lcm(...values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return Math.abs(values[0]);
  }
  return values.slice(1).reduce((acc, val) => lcmTwo(acc, val), Math.abs(values[0]));
}

/**
 * Returns a function that computes LCM with a fixed seed value.
 * Each call computes lcm(seed, value) using the original seed.
 * - When seed is non-zero and input is zero, returns the seed
 * - When seed is zero, returns the input value
 */
export function lcmWith(seed: number): (value: number) => number {
  return (value: number): number => {
    if (seed === 0 && value === 0) {
      return 0;
    }
    if (seed === 0) {
      return Math.abs(value);
    }
    if (value === 0) {
      return Math.abs(seed);
    }
    return lcmTwo(seed, value);
  };
}
