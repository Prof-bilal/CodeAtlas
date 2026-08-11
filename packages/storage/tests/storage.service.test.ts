import type { Project, SourceFile, Symbol } from "@atlas/core";
import type { FilePath, ProjectId, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ContextStore } from "../src/context-store";
import { StorageService } from "../src/storage.service";

const file = (path: string, content = "export const value = 1;"): SourceFile => ({
  path: path as FilePath,
  language: "typescript",
  content,
});

const symbol = (symbolId: string, name: string, filePath: string): Symbol => ({
  id: symbolId as SymbolId,
  name,
  kind: "function",
  filePath: filePath as FilePath,
  location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
  parentId: null,
  visibility: "exported",
  exported: true,
  modifiers: ["export"],
  moduleSpecifier: null,
  typeText: null,
  documentation: null,
});

describe("StorageService", () => {
  it("saves and loads a project", async () => {
    const service = new StorageService();
    const project: Project = { id: "p1" as ProjectId, name: "demo", rootPath: "/repo" as FilePath };
    const saved = await service.saveProject(project);
    expect(saved.ok).toBe(true);

    const loaded = await service.loadProject(project.id);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value).toEqual(project);
  });

  it("returns undefined for an unknown project id", async () => {
    const service = new StorageService();
    const loaded = await service.loadProject("nope" as ProjectId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value).toBeUndefined();
  });

  it("saveFiles persists files and their hashes", async () => {
    const store = new ContextStore();
    const service = new StorageService({ store });
    const result = await service.saveFiles([file("/a.ts", "export const a = 1;")]);
    expect(result.ok).toBe(true);
    expect(store.loadContext().files).toHaveLength(1);
    expect(store.loadContext().hashes?.["/a.ts"]).toBeTruthy();
  });

  it("saveSymbols persists symbols", async () => {
    const store = new ContextStore();
    const service = new StorageService({ store });
    const result = await service.saveSymbols([symbol("s1", "run", "/a.ts")]);
    expect(result.ok).toBe(true);
    expect(store.loadContext().symbols?.map((s) => s.name)).toEqual(["run"]);
  });
});
