import { describe, expect, it } from "vitest";
import { parseJsonc, stripJsoncComments, stripTrailingCommas } from "../src/jsonc";

describe("jsonc parsing", () => {
  it("strips line and block comments without touching string content", () => {
    const input = [
      "{",
      "  // a line comment",
      '  "path": "C:\\\\not\\\\a\\\\comment",',
      "  /* a block",
      "     comment */",
      '  "url": "https://example.com/#frag", // trailing"',
      "}",
    ].join("\n");
    const stripped = stripJsoncComments(input);
    expect(stripped).not.toContain("line comment");
    expect(stripped).toContain('"path": "C:\\\\not\\\\a\\\\comment"');
    expect(stripped).toContain('"url": "https://example.com/#frag"');
  });

  it("strips trailing commas outside strings", () => {
    const input = [
      "{",
      '  "a": 1,',
      '  "b": "comma, inside string,",',
      '  "c": [1, 2,],',
      "}",
    ].join("\n");
    const stripped = stripTrailingCommas(input);
    expect(stripped).not.toMatch(/,\s*}/);
    expect(stripped).not.toMatch(/,\s*]/);
    expect(stripped).toContain('"b": "comma, inside string,"');
  });

  it("parses JSONC with comments and trailing commas into plain JSON-compatible data", () => {
    const raw = [
      "{",
      "  // active tool",
      '  "mcp": {',
      '    "codeatlas": {',
      '      "type": "local",',
      '      "command": ["atlas", "mcp"],',
      '      "enabled": true,',
      "    },",
      "  },",
      "}",
    ].join("\n");
    const result = parseJsonc(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      mcp: { codeatlas: { type: "local", command: ["atlas", "mcp"], enabled: true } },
    });
  });

  it("fails on genuinely invalid JSONC", () => {
    const result = parseJsonc("{ mcp: }");
    expect(result.ok).toBe(false);
  });
});
