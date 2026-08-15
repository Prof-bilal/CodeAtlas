import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GitignoreMatcher, type GitignoreScope, parseGitignore } from "../src/gitignore";

function scope(base: string, content: string): GitignoreScope {
  return { base: resolve(base), rules: parseGitignore(content) };
}

function matcher(content: string): GitignoreMatcher {
  return GitignoreMatcher.empty().withScope(resolve("/repo"), parseGitignore(content));
}

/** Path relative to `/repo` (gitignore rules are base-relative). */
function rel(parts: string): string {
  return join(resolve("/repo"), ...parts.split("/"));
}

describe("parseGitignore", () => {
  it("skips blank lines and comments", () => {
    const rules = parseGitignore("\n# comment\n\nnode_modules/\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.directoryOnly).toBe(true);
  });

  it("parses negation, directory-only, and anchored rules", () => {
    const rules = parseGitignore("!keep.log\nbuild/\n/root-only\nfoo/bar\n*.log");
    expect(rules.map((r) => r.pattern)).toEqual([
      "keep.log",
      "build",
      "root-only",
      "foo/bar",
      "*.log",
    ]);
    expect(rules.map((r) => r.negated)).toEqual([true, false, false, false, false]);
    expect(rules.map((r) => r.directoryOnly)).toEqual([false, true, false, false, false]);
    expect(rules.map((r) => r.anchored)).toEqual([false, false, true, true, false]);
  });

  it("caps over-long lines and excessive rules", () => {
    const rules = parseGitignore(`${"a".repeat(600)}\n${"x\n".repeat(6000)}`);
    expect(rules.length).toBeLessThanOrEqual(5001);
  });
});

describe("GitignoreMatcher", () => {
  it("matches unanchored patterns at any depth", () => {
    const m = matcher("*.log\n.env");
    expect(m.isIgnored(rel("debug.log"), false)).toBe(true);
    expect(m.isIgnored(rel("a/b/debug.log"), false)).toBe(true);
    expect(m.isIgnored(rel("src/env/.env"), false)).toBe(true);
    expect(m.isIgnored(rel("src/main.ts"), false)).toBe(false);
  });

  it("matches directory-only patterns against directories only", () => {
    const m = matcher("dist/\nnode_modules/");
    expect(m.isIgnored(rel("dist"), true)).toBe(true);
    expect(m.isIgnored(rel("a/node_modules"), true)).toBe(true);
    expect(m.isIgnored(rel("dist"), false)).toBe(false); // file named dist not ignored
    expect(m.isIgnored(rel("dist/main.js"), false)).toBe(true); // inside ignored dir
  });

  it("anchors patterns with a leading slash to the scope root", () => {
    const m = matcher("/build\n/root-only.txt");
    expect(m.isIgnored(rel("build"), true)).toBe(true);
    expect(m.isIgnored(rel("src/build"), true)).toBe(false);
    expect(m.isIgnored(rel("root-only.txt"), false)).toBe(true);
    expect(m.isIgnored(rel("a/root-only.txt"), false)).toBe(false);
  });

  it("anchors patterns with an interior slash relative to the scope", () => {
    const m = matcher("src/generated/\nfoo/bar.ts");
    expect(m.isIgnored(rel("src/generated"), true)).toBe(true);
    expect(m.isIgnored(rel("generated"), true)).toBe(false);
    expect(m.isIgnored(rel("foo/bar.ts"), false)).toBe(true);
    expect(m.isIgnored(rel("other/foo/bar.ts"), false)).toBe(false);
  });

  it("re-includes negated matches (last rule wins)", () => {
    const m = matcher("*.log\n!important.log");
    expect(m.isIgnored(rel("debug.log"), false)).toBe(true);
    expect(m.isIgnored(rel("important.log"), false)).toBe(false);
    const m2 = matcher("!keep\nkeep");
    expect(m2.isIgnored(rel("keep"), false)).toBe(true);
  });

  it("applies nested scopes with later scopes winning", () => {
    const root = scope("/repo", "*.log");
    const nested = scope("/repo/src", "!special.log");
    const m = GitignoreMatcher.empty()
      .withScope(root.base, root.rules)
      .withScope(nested.base, nested.rules);
    expect(m.isIgnored(rel("src/debug.log"), false)).toBe(true);
    expect(m.isIgnored(rel("src/special.log"), false)).toBe(false);
    expect(m.isIgnored(rel("debug.log"), false)).toBe(true);
    expect(m.isIgnored(rel("special.log"), false)).toBe(true); // outside nested scope
  });

  it("ignores paths outside a scope's base directory", () => {
    const m = matcher("*.log");
    expect(m.isIgnored(resolve("/other/debug.log"), false)).toBe(false);
  });

  it("supports ** globs", () => {
    const m = matcher("**/tmp/");
    expect(m.isIgnored(rel("tmp"), true)).toBe(true);
    expect(m.isIgnored(rel("a/b/tmp"), true)).toBe(true);
    expect(m.isIgnored(rel("a/tmp-cache"), true)).toBe(false);
  });

  it("disabled matcher never ignores anything", () => {
    const disabled = GitignoreMatcher.disabled();
    expect(disabled.isIgnored(rel("debug.log"), false)).toBe(false);
    expect(
      disabled
        .withScope(resolve("/repo"), parseGitignore("*.log"))
        .isIgnored(rel("debug.log"), false),
    ).toBe(false);
  });
});
