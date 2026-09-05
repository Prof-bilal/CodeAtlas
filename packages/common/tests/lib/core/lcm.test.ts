import { describe, expect, it } from "vitest";
import { lcm, lcmTwo, lcmWith } from "../../../src/lib/core";

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function referenceLcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return (Math.abs(a) / gcd(a, b)) * Math.abs(b);
}

describe("lcmTwo", () => {
  it("calculates lcm of two positive numbers", () => {
    expect(lcmTwo(2, 3)).toBe(6);
    expect(lcmTwo(4, 6)).toBe(12);
    expect(lcmTwo(7, 5)).toBe(35);
  });

  it("returns zero when either argument is zero", () => {
    expect(lcmTwo(0, 5)).toBe(0);
    expect(lcmTwo(5, 0)).toBe(0);
    expect(lcmTwo(0, 0)).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(lcmTwo(-2, 3)).toBe(6);
    expect(lcmTwo(2, -3)).toBe(6);
    expect(lcmTwo(-2, -3)).toBe(6);
  });

  it("returns the number itself when both arguments are equal", () => {
    expect(lcmTwo(5, 5)).toBe(5);
    expect(lcmTwo(12, 12)).toBe(12);
  });

  it("handles one being a multiple of the other", () => {
    expect(lcmTwo(3, 9)).toBe(9);
    expect(lcmTwo(9, 3)).toBe(9);
    expect(lcmTwo(1, 7)).toBe(7);
  });

  it("matches reference implementation", () => {
    const pairs: [number, number][] = [
      [1, 1],
      [2, 4],
      [3, 7],
      [6, 10],
      [12, 18],
      [15, 25],
      [100, 75],
    ];
    for (const [a, b] of pairs) {
      expect(lcmTwo(a, b)).toBe(referenceLcm(a, b));
      expect(lcmTwo(b, a)).toBe(referenceLcm(b, a));
    }
  });
});

describe("lcm", () => {
  it("returns the single value when given one argument", () => {
    expect(lcm(5)).toBe(5);
    expect(lcm(0)).toBe(0);
    expect(lcm(-3)).toBe(3);
  });

  it("returns the lcm of two arguments", () => {
    expect(lcm(2, 3)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
  });

  it("returns the lcm of three arguments", () => {
    expect(lcm(2, 3, 4)).toBe(12);
    expect(lcm(3, 5, 7)).toBe(105);
    expect(lcm(4, 6, 8)).toBe(24);
  });

  it("returns the lcm of four or more arguments", () => {
    expect(lcm(2, 3, 4, 5)).toBe(60);
    expect(lcm(2, 3, 4, 5, 6)).toBe(60);
    expect(lcm(2, 3, 4, 5, 6, 7)).toBe(420);
  });

  it("returns zero when any argument is zero", () => {
    expect(lcm(1, 2, 0, 4)).toBe(0);
    expect(lcm(0, 1, 2, 3)).toBe(0);
  });

  it("handles all identical values", () => {
    expect(lcm(5, 5, 5)).toBe(5);
    expect(lcm(7, 7, 7, 7)).toBe(7);
  });

  it("handles mixed positive and negative", () => {
    expect(lcm(-2, 3, 4)).toBe(12);
    expect(lcm(2, -3, -4)).toBe(12);
  });
});

describe("lcmWith", () => {
  it("returns a function that computes lcm with a fixed seed", () => {
    const withSix = lcmWith(6);
    expect(withSix(2)).toBe(6);
    expect(withSix(3)).toBe(6);
    expect(withSix(4)).toBe(12);
    expect(withSix(7)).toBe(42);
  });

  it("can be used to compute multiple lcms", () => {
    const withFour = lcmWith(4);
    // Each call uses the original seed
    expect(withFour(6)).toBe(12); // lcm(4, 6) = 12
    expect(withFour(3)).toBe(12); // lcm(4, 3) = 12
    expect(withFour(5)).toBe(20); // lcm(4, 5) = 20
    expect(withFour(10)).toBe(20); // lcm(4, 10) = 20
  });

  it("returns the seed itself when the input is zero", () => {
    const withFive = lcmWith(5);
    expect(withFive(0)).toBe(5);
  });

  it("returns the input when the seed is zero", () => {
    const withZero = lcmWith(0);
    expect(withZero(5)).toBe(5);
    expect(withZero(0)).toBe(0);
  });

  it("handles negative values", () => {
    const withThree = lcmWith(-3);
    expect(withThree(6)).toBe(6);
    expect(withThree(-6)).toBe(6);
  });
});

describe("type inference", () => {
  it("infers number for lcm(number, number)", () => {
    const result = lcm(2, 3);
    const _: number = result;
    expect(typeof result).toBe("number");
  });

  it("infers number for lcm() (variadic)", () => {
    const values = [2, 3, 4] as const;
    const result = lcm(...values);
    const _: number = result;
    expect(typeof result).toBe("number");
  });

  it("lcmWith returns chainable function", () => {
    const fn = lcmWith(6);
    const result = fn(4);
    expect(typeof result).toBe("number");
  });
});
