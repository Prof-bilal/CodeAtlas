import type { ContextSnapshot, SourceFile } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { SearchService } from "../src/search.service";
import {
  CONTENT_WINDOW_STRIDE,
  MAX_CONTENT_WINDOWS,
  MAX_INDEXED_CONTENT_CHARS,
  contentWindows,
} from "../src/search-index";

function file(path: string, content = ""): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function snapshot(files: SourceFile[]): ContextSnapshot {
  return {
    version: 1,
    savedAt: "2026-09-06T00:00:00.000Z",
    files,
  };
}

/** Number of leading chars of a body that the windowed index covers. */
function coverageLength(bodyLength: number): number {
  return Math.min(
    bodyLength,
    (MAX_CONTENT_WINDOWS - 1) * CONTENT_WINDOW_STRIDE + MAX_INDEXED_CONTENT_CHARS,
  );
}

describe("content windowing (F2)", () => {
  it("keeps a short file in a single full-body window", () => {
    const windows = contentWindows("short body");
    expect(windows).toHaveLength(1);
    expect(windows[0]?.startChar).toBe(0);
    expect(windows[0]?.content).toBe("short body");
  });

  it("windows a long body with the configured stride and bound", () => {
    // 10k chars → windows start at 0,1000,…, each ≤ 2000, capped at 8.
    const body = "0123456789".repeat(1000);
    const windows = contentWindows(body);
    expect(windows.length).toBeLessThanOrEqual(MAX_CONTENT_WINDOWS);
    expect(windows[0]?.startChar).toBe(0);
    if (windows[1] !== undefined) {
      expect(windows[1].startChar).toBe(CONTENT_WINDOW_STRIDE);
    }
    for (const window of windows) {
      expect(window.content.length).toBeLessThanOrEqual(MAX_INDEXED_CONTENT_CHARS);
    }
  });

  it("covers far more of a file than the old single 2000-char excerpt", () => {
    const body = "y".repeat(50_000);
    const windows = contentWindows(body);
    const covered = coverageLength(body.length);
    expect(covered).toBeGreaterThan(MAX_INDEXED_CONTENT_CHARS * 4); // ≥ 8k+ chars now
    // A marker just inside the covered span is in some window.
    const markerAt = covered - 50;
    expect(
      windows.some(
        (window) =>
          window.startChar <= markerAt && markerAt < window.startChar + window.content.length,
      ),
    ).toBe(true);
    // A marker beyond the covered span is in no window (memory bound holds).
    const beyondAt = covered + 100;
    expect(
      windows.some(
        (window) =>
          window.startChar <= beyondAt && beyondAt < window.startChar + window.content.length,
      ),
    ).toBe(false);
  });

  it("recalls a match beyond the old 2000-char excerpt (late-file match)", () => {
    const head = "export const HEAD = 1;\n";
    const marker = "export function deepFunction() { return 42; }\n";
    // Place the marker ~4k chars in — past the old cliff, inside the new span.
    const filler = "// padding\n".repeat(350);
    const content = `${head}${filler}${marker}`;
    expect(content.indexOf("deepFunction")).toBeGreaterThan(MAX_INDEXED_CONTENT_CHARS);

    const service = new SearchService();
    service.indexSnapshot(
      snapshot([file("/src/deep.ts", content), file("/src/shallow.ts", marker)]),
    );

    // deep.ts must surface for a symbol defined past the old excerpt cliff.
    const hits = service.search("deepFunction", { types: ["file"] });
    expect(hits.some((hit) => hit.title === "/src/deep.ts")).toBe(true);
  });

  it("attributes the match to the winning window's char range", () => {
    // Basename "impl.ts" must NOT match the query so the content window is
    // what drives the hit — otherwise attribution would be spurious.
    const body = `${"x".repeat(5000)}export const LATE = 1;`;
    const lateIndex = body.indexOf("LATE");
    expect(lateIndex).toBeGreaterThan(MAX_INDEXED_CONTENT_CHARS); // past the cliff
    const service = new SearchService();
    service.indexSnapshot(snapshot([file("/src/impl.ts", body)]));

    const hits = service.search("LATE", { types: ["file"] });
    const hit = hits.find((h) => h.title === "/src/impl.ts");
    expect(hit).toBeDefined();
    const range = (hit as { contentRange?: { startChar: number; endChar: number } }).contentRange;
    expect(range).toBeDefined();
    // The attributed window must actually span the matched text.
    expect(range?.startChar ?? -1).toBeLessThanOrEqual(lateIndex);
    expect(range?.endChar ?? 0).toBeGreaterThan(lateIndex);
    expect(range?.startChar ?? 0).toBeGreaterThan(2000); // a later window won
  });

  it("does not attribute a range when the basename/path drove the match", () => {
    const body = `${"x".repeat(5000)}export const LATE = 1;`;
    const service = new SearchService();
    service.indexSnapshot(snapshot([file("/src/late.ts", body)]));

    const hits = service.search("LATE", { types: ["file"] });
    const hit = hits.find((h) => h.title === "/src/late.ts");
    expect(hit).toBeDefined();
    const range = (hit as { contentRange?: { startChar: number; endChar: number } }).contentRange;
    expect(range).toBeUndefined();
  });
});
