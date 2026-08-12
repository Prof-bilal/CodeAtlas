import { describe, expect, it } from "vitest";
import { extractVersion, satisfiesVersionRange } from "../src/version-range";

describe("extractVersion", () => {
  it("extracts a semver from arbitrary text", () => {
    expect(extractVersion("v22.14.0")).toBe("22.14.0");
    expect(extractVersion("Python 3.12.1")).toBe("3.12.1");
    expect(extractVersion("go version go1.22.3")).toBe("1.22.3");
    expect(extractVersion("1.2")).toBe("1.2.0");
    expect(extractVersion("42")).toBe("42.0.0");
  });

  it("returns null when no version is present", () => {
    expect(extractVersion("not found")).toBeNull();
    expect(extractVersion("")).toBeNull();
    expect(extractVersion("v")).toBeNull();
  });
});

describe("satisfiesVersionRange", () => {
  it("matches any version for wildcard ranges", () => {
    expect(satisfiesVersionRange("20.19.0", "")).toBe(true);
    expect(satisfiesVersionRange("1.2.3", "*")).toBe(true);
    expect(satisfiesVersionRange("0.0.1", "x")).toBe(true);
  });

  it("matches exact versions", () => {
    expect(satisfiesVersionRange("20.19.0", "20.19.0")).toBe(true);
    expect(satisfiesVersionRange("20.19.1", "20.19.0")).toBe(false);
  });

  it("matches comparison operators", () => {
    expect(satisfiesVersionRange("21.0.0", ">=20.19.0")).toBe(true);
    expect(satisfiesVersionRange("20.19.0", ">=20.19.0")).toBe(true);
    expect(satisfiesVersionRange("20.18.0", ">=20.19.0")).toBe(false);
    expect(satisfiesVersionRange("19.0.0", "<20.0.0")).toBe(true);
    expect(satisfiesVersionRange("3.1.0", ">3.0.0")).toBe(true);
    expect(satisfiesVersionRange("3.0.0", ">3.0.0")).toBe(false);
    expect(satisfiesVersionRange("3.0.0", "<=3.0.0")).toBe(true);
  });

  it("matches caret and tilde ranges", () => {
    expect(satisfiesVersionRange("20.25.0", "^20.19.0")).toBe(true);
    expect(satisfiesVersionRange("20.5.1", "^20.19.0")).toBe(false);
    expect(satisfiesVersionRange("21.0.0", "^20.19.0")).toBe(false);
    expect(satisfiesVersionRange("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfiesVersionRange("0.3.0", "^0.2.3")).toBe(false);
    expect(satisfiesVersionRange("20.19.5", "~20.19.0")).toBe(true);
    expect(satisfiesVersionRange("20.20.0", "~20.19.0")).toBe(false);
  });

  it("matches space-separated AND groups", () => {
    expect(satisfiesVersionRange("20.5.0", ">=20.0.0 <21.0.0")).toBe(true);
    expect(satisfiesVersionRange("21.0.0", ">=20.0.0 <21.0.0")).toBe(false);
    expect(satisfiesVersionRange("19.9.9", ">=20.0.0 <21.0.0")).toBe(false);
  });

  it("matches OR groups with ||", () => {
    expect(satisfiesVersionRange("22.0.0", ">=22.0.0 || <19.0.0")).toBe(true);
    expect(satisfiesVersionRange("18.0.0", ">=22.0.0 || <19.0.0")).toBe(true);
    expect(satisfiesVersionRange("20.0.0", ">=22.0.0 || <19.0.0")).toBe(false);
  });

  it("fails closed on unparseable input", () => {
    expect(satisfiesVersionRange("banana", ">=20.0.0")).toBe(false);
    expect(satisfiesVersionRange("20.0.0", "totally-bogus")).toBe(false);
    expect(satisfiesVersionRange("20.0.0", "20.0.0 - 21.0.0")).toBe(false);
    expect(satisfiesVersionRange("20.0.0", ">=20.0.0-alpha")).toBe(false);
  });
});
