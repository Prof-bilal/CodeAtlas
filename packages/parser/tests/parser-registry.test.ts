import type { SourceFile } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import type { LanguageParser } from "../src/language-parser";
import type { ParsedFile } from "../src/parsed-file";
import { ParserRegistry } from "../src/parser-registry";

class DummyParser implements LanguageParser {
  public constructor(public readonly languages: readonly string[]) {}

  public async parse(file: SourceFile): Promise<Result<ParsedFile>> {
    return ok({ path: file.path, language: this.languages[0], symbols: [], references: [] });
  }
}

describe("ParserRegistry", () => {
  it("registers and retrieves a parser by language", () => {
    const registry = new ParserRegistry();
    const parser = new DummyParser(["typescript"]);
    registry.register(parser);

    expect(registry.get("typescript")).toBe(parser);
    expect(registry.get("python")).toBeUndefined();
  });

  it("registers one parser for several languages", () => {
    const registry = new ParserRegistry();
    const parser = new DummyParser(["js", "ts"]);
    registry.register(parser);

    expect(registry.get("js")).toBe(parser);
    expect(registry.get("ts")).toBe(parser);
    expect(registry.supportedLanguages()).toEqual(["js", "ts"]);
  });

  it("replaces an existing registration for the same language", () => {
    const registry = new ParserRegistry();
    const first = new DummyParser(["ts"]);
    const second = new DummyParser(["ts"]);
    registry.register(first);
    registry.register(second);

    expect(registry.get("ts")).toBe(second);
    expect(registry.supportedLanguages()).toEqual(["ts"]);
  });

  it("supports chained registration", () => {
    const registry = new ParserRegistry();
    registry.register(new DummyParser(["a"])).register(new DummyParser(["b"]));

    expect(registry.supportedLanguages()).toEqual(["a", "b"]);
  });
});
