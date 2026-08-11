import type { SourceFile } from "@atlas/core";
import type { FilePath, Result, SymbolId } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { UnsupportedLanguageError } from "../src/errors";
import type { LanguageParser } from "../src/language-parser";
import type { ParsedFile } from "../src/parsed-file";
import { ParserService } from "../src/parser.service";

function tsSource(content: string, path = "/fixture/a.ts"): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function pythonSource(content: string): SourceFile {
  return { path: "/fixture/a.py" as FilePath, language: "python", content };
}

/** A parser that records how many files it was asked to parse. */
class CountingParser implements LanguageParser {
  public parseCount = 0;
  public constructor(public readonly languages: readonly string[]) {}

  public async parse(file: SourceFile): Promise<Result<ParsedFile>> {
    this.parseCount += 1;
    return ok({ path: file.path, language: this.languages[0], symbols: [], references: [] });
  }
}

/** A parser whose parses always fail. */
class FailingParser implements LanguageParser {
  public readonly languages = ["broken"];

  public async parse(): Promise<Result<ParsedFile>> {
    return fail(new Error("boom"));
  }
}

describe("ParserService", () => {
  it("implements ParserPort and returns normalized symbols", async () => {
    const service = new ParserService();
    const result = await service.parse(tsSource("export class A {}"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const klass = result.value.find((symbol) => symbol.kind === "class");
      expect(klass?.name).toBe("A");
      expect(klass?.exported).toBe(true);
      expect(klass?.location.startLine).toBe(1);
    }
  });

  it("indexes parsed symbols so resolveSymbol can locate them", async () => {
    const service = new ParserService();
    const result = await service.parse(tsSource("export class A {}"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const klass = result.value[0];
    const resolved = service.resolveSymbol(klass.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value).toEqual(klass);
    }
  });

  it("resolves unknown ids to undefined", () => {
    const service = new ParserService();
    const resolved = service.resolveSymbol("unknown" as SymbolId);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value).toBeUndefined();
    }
  });

  it("fails with UnsupportedLanguageError for an unregistered language", async () => {
    const service = new ParserService();
    const result = await service.parse(pythonSource("x = 1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UnsupportedLanguageError);
    }
  });

  it("parses only the supplied (changed) files and reports the rest as skipped", async () => {
    const service = new ParserService();
    const batch = await service.parseFiles([
      tsSource("export const A = 1;", "/fixture/a.ts"),
      pythonSource("x = 1"),
      tsSource("export const B = 2;", "/fixture/b.ts"),
    ]);

    expect(batch.parsed).toHaveLength(2);
    expect(batch.parsed.map((file) => file.path)).toEqual(["/fixture/a.ts", "/fixture/b.ts"]);
    expect(batch.parsed.flatMap((file) => file.symbols)).toHaveLength(2);

    expect(batch.skipped).toHaveLength(1);
    expect(batch.skipped[0].path).toBe("/fixture/a.py");
    expect(batch.skipped[0].reason).toContain("python");
  });

  it("reports failing parses in the batch's skipped list without throwing", async () => {
    const service = new ParserService();
    service.registerParser(new FailingParser());
    const batch = await service.parseFiles([
      { path: "/fixture/x.br" as FilePath, language: "broken", content: "" },
    ]);
    expect(batch.parsed).toHaveLength(0);
    expect(batch.skipped).toHaveLength(1);
    expect(batch.skipped[0].reason).toBe("boom");
  });

  it("produces identical symbol ids when a file is parsed twice", async () => {
    const service = new ParserService();
    const first = await service.parse(tsSource("export class A {}"));
    const second = await service.parse(tsSource("export class A {}"));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.map((s) => s.id)).toEqual(second.value.map((s) => s.id));
    }
  });

  it("supports registering a new language parser as a plugin", async () => {
    const service = new ParserService();
    const python = new CountingParser(["python"]);
    service.registerParser(python);

    const result = await service.parseFile(pythonSource("x = 1"));
    expect(result.ok).toBe(true);
    expect(python.parseCount).toBe(1);
    expect(service.supportedLanguages()).toEqual(["typescript", "python"]);
  });

  it("lists TypeScript as a supported language out of the box", () => {
    const service = new ParserService();
    expect(service.supportedLanguages()).toEqual(["typescript"]);
  });
});
