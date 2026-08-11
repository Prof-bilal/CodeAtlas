import type { SymbolLocation } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { createSymbolId } from "../src/symbol-id";

const location: SymbolLocation = {
  startLine: 10,
  startColumn: 1,
  endLine: 12,
  endColumn: 5,
};

describe("createSymbolId", () => {
  it("is deterministic for the same file, name, and position", () => {
    const first = createSymbolId("/x.ts" as FilePath, "foo", location);
    const second = createSymbolId("/x.ts" as FilePath, "foo", location);
    expect(first).toBe(second);
  });

  it("differs across files, names, and positions", () => {
    const base = createSymbolId("/x.ts" as FilePath, "foo", location);
    expect(base).not.toBe(createSymbolId("/y.ts" as FilePath, "foo", location));
    expect(base).not.toBe(createSymbolId("/x.ts" as FilePath, "bar", location));
    expect(base).not.toBe(
      createSymbolId("/x.ts" as FilePath, "foo", { ...location, startColumn: 7 }),
    );
  });

  it("encodes the span so ids are human-readable", () => {
    const id = createSymbolId("/src/a.ts" as FilePath, "main", location);
    expect(id).toContain("main@10:1");
  });
});
