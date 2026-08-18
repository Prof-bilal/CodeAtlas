import { describe, expect, it } from "vitest";
import { SHA256_HEX_LENGTH, hashContent } from "../src/crypto";

describe("hashContent", () => {
  it("matches the known SHA-256 vector for 'abc'", () => {
    expect(hashContent("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the known SHA-256 vector for the empty string", () => {
    expect(hashContent("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces a 64-character lowercase hex digest", () => {
    const digest = hashContent("some content");
    expect(digest).toHaveLength(SHA256_HEX_LENGTH);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("differs for different input", () => {
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });
});
