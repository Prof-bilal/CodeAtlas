import { describe, expect, it } from "vitest";
import { editDistance, fuzzyThreshold, isFuzzyMatch, isTokenMatch, similarity } from "../src/fuzzy";

describe("editDistance", () => {
  it("computes classic edit distances", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(editDistance("Auth", "auth")).toBe(0);
  });
});

describe("fuzzyThreshold", () => {
  it("requires exactness for single characters and grows tolerance with length", () => {
    expect(fuzzyThreshold(1)).toBe(0);
    expect(fuzzyThreshold(4)).toBe(1);
    expect(fuzzyThreshold(8)).toBe(2);
    expect(fuzzyThreshold(12)).toBe(3);
  });
});

describe("isFuzzyMatch", () => {
  it("matches small typos in identifier-like names", () => {
    expect(isFuzzyMatch("middleware", "mideleware")).toBe(true);
    expect(isFuzzyMatch("auth", "auth")).toBe(true);
  });

  it("rejects strings that are too different", () => {
    expect(isFuzzyMatch("auth", "database")).toBe(false);
    expect(isFuzzyMatch("a", "b")).toBe(false);
  });

  it("ignores empty queries", () => {
    expect(isFuzzyMatch("", "anything")).toBe(false);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for maximally different ones", () => {
    expect(similarity("x", "x")).toBe(1);
    expect(similarity("", "")).toBe(1);
    expect(similarity("a", "bb")).toBe(0);
  });
});

describe("isTokenMatch", () => {
  it("matches whole tokens at word boundaries", () => {
    expect(isTokenMatch("UserService", "export class UserService {")).toBe(true);
    expect(isTokenMatch("middleware", "import { middleware } from './auth'")).toBe(true);
  });

  it("does not match inside a longer identifier", () => {
    expect(isTokenMatch("User", "UserService")).toBe(false);
    expect(isTokenMatch("auth", "authenticate")).toBe(false);
  });
});
