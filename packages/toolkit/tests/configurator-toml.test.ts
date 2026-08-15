import { describe, expect, it } from "vitest";
import {
  mergeTomlSection,
  parseTomlDocument,
  renderTomlValue,
  serializeTomlDocument,
} from "../src/configurator-toml";

const codexFixture = [
  "# user comment that must survive",
  'model = "gpt-5-mini"',
  'notify = ["path-a", "path-b"]',
  "",
  "[mcp_servers.node_repl]",
  'command = "node_repl.exe"',
  'args = ["--port", "8899"]',
  "",
  "[projects.'c:\\some\\path']",
  'trust_level = "trusted"',
  "",
].join("\n");

describe("toml parser", () => {
  it("parses a real-style Codex config.toml", () => {
    const result = parseTomlDocument(codexFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value["model"]).toBe("gpt-5-mini");
    expect(result.value["notify"]).toEqual(["path-a", "path-b"]);
    expect(result.value["mcp_servers"]).toEqual({
      node_repl: { command: "node_repl.exe", args: ["--port", "8899"] },
    });
    expect(result.value["projects"]).toEqual({ "c:\\some\\path": { trust_level: "trusted" } });
  });

  it("parses inline tables and booleans", () => {
    const result = parseTomlDocument(
      ["[server]", 'env = { ATLAS_ROOT = "C:\\\\repo", DEBUG = true }', "keep = false"].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value["server"]).toEqual({
      env: { ATLAS_ROOT: "C:\\repo", DEBUG: true },
      keep: false,
    });
  });

  it("fails closed on a line it cannot understand", () => {
    const result = parseTomlDocument('model = "a"\nthis is not toml');
    expect(result.ok).toBe(false);
  });

  it("supports array-of-tables headers", () => {
    const result = parseTomlDocument(
      ["[[plugins]]", 'name = "one"', "[[plugins]]", 'name = "two"'].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value["plugins"]).toEqual([{ name: "one" }, { name: "two" }]);
  });
});

describe("toml serializer", () => {
  it("renders values (strings, numbers, booleans, arrays, inline tables)", () => {
    expect(renderTomlValue("atlas mcp")).toBe('"atlas mcp"');
    expect(renderTomlValue(42)).toBe("42");
    expect(renderTomlValue(true)).toBe("true");
    expect(renderTomlValue(["a", "b"])).toBe('["a", "b"]');
    expect(renderTomlValue({ ATLAS_ROOT: "C:\\repo" })).toBe('{ ATLAS_ROOT = "C:\\\\repo" }');
  });

  it("round-trips a parsed document", () => {
    const result = parseTomlDocument(codexFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reparsed = parseTomlDocument(serializeTomlDocument(result.value));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(result.value);
  });
});

describe("surgical toml merge", () => {
  it("creates the managed block in an empty file", () => {
    const merged = mergeTomlSection(null, "mcp_servers", "codeatlas", {
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "C:\\repo" },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.text).toBe(
      '[mcp_servers.codeatlas]\ncommand = "atlas"\nargs = ["mcp"]\nenv = { ATLAS_ROOT = "C:\\\\repo" }\n',
    );
  });

  it("preserves every unrelated line byte-for-byte when appending", () => {
    const merged = mergeTomlSection(codexFixture, "mcp_servers", "codeatlas", {
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "C:\\repo" },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const text = merged.value.text;
    for (const preserved of [
      "# user comment that must survive",
      'model = "gpt-5-mini"',
      'command = "node_repl.exe"',
      "[projects.'c:\\some\\path']",
    ]) {
      expect(text).toContain(preserved);
    }
    expect(text).toContain("[mcp_servers.codeatlas]");
    const reparsed = parseTomlDocument(text);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value["mcp_servers"]).toMatchObject({
      codeatlas: { command: "atlas", args: ["mcp"] },
    });
    expect(reparsed.value["model"]).toBe("gpt-5-mini");
  });

  it("replaces an existing managed block in place", () => {
    const before = [
      'model = "gpt-5-mini"',
      "",
      "[mcp_servers.codeatlas]",
      'command = "old-atlas"',
      "",
      "[mcp_servers.node_repl]",
      'command = "node_repl.exe"',
      "",
    ].join("\n");
    const merged = mergeTomlSection(before, "mcp_servers", "codeatlas", {
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "C:\\repo" },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const text = merged.value.text;
    expect(text).not.toContain("old-atlas");
    expect(text).toContain('command = "atlas"');
    expect(text.indexOf("[mcp_servers.codeatlas]")).toBeLessThan(
      text.indexOf("[mcp_servers.node_repl]"),
    );
    const count = (text.match(/\[mcp_servers\.codeatlas\]/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("is idempotent for an already-configured file", () => {
    const entry = { command: "atlas", args: ["mcp"], env: { ATLAS_ROOT: "C:\\repo" } };
    const first = mergeTomlSection(codexFixture, "mcp_servers", "codeatlas", entry);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = mergeTomlSection(first.value.text, "mcp_servers", "codeatlas", entry);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.text).toBe(first.value.text);
  });

  it("preserves CRLF line endings", () => {
    const crlf = 'model = "a"\r\n\r\n[mcp_servers.node_repl]\r\ncommand = "x"\r\n';
    const merged = mergeTomlSection(crlf, "mcp_servers", "codeatlas", {
      command: "atlas",
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.text).not.toMatch(/(?<!\r)\n/);
    expect(merged.value.text.includes("\r\n")).toBe(true);
  });

  it("inserts into an existing root table at the right spot", () => {
    const before = ["[mcp_servers.node_repl]", 'command = "node_repl.exe"', ""].join("\n");
    const merged = mergeTomlSection(before, "mcp_servers", "codeatlas", {
      command: "atlas",
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const text = merged.value.text;
    expect(text).toContain("[mcp_servers.codeatlas]");
    expect(text).toContain("[mcp_servers.node_repl]");
    expect(text.indexOf("[mcp_servers.codeatlas]")).toBeLessThan(
      text.indexOf("[mcp_servers.node_repl]"),
    );
    const reparsed = parseTomlDocument(text);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value["mcp_servers"]).toMatchObject({ codeatlas: { command: "atlas" } });
  });
});
