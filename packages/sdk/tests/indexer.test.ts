import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContextStore } from "@atlas/storage";
import { afterEach, describe, expect, it } from "vitest";
import { indexProject } from "../src/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("indexProject", () => {
  it("creates the manifest and context database for a real project tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-indexer-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "math.ts"),
      "export function double(value: number) { return value * 2; }\n",
    );
    await writeFile(
      join(root, "src", "index.ts"),
      'import { double } from "./math"; export const answer = double(21);\n',
    );

    const result = await indexProject({ repositoryPath: root, mode: "build" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toBe(2);
    expect(result.value.parsedFiles).toBe(2);
    expect(result.value.symbols).toBeGreaterThan(0);
    expect(result.value.added).toBe(2);

    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      expect(store.loadContext().files).toHaveLength(2);
      expect(store.loadContext().symbols?.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("reports a no-change incremental update", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-indexer-"));
    roots.push(root);
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    const first = await indexProject({ repositoryPath: root, mode: "build" });
    expect(first.ok).toBe(true);
    const second = await indexProject({ repositoryPath: root, mode: "update" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.added).toBe(0);
    expect(second.value.changed).toBe(0);
    expect(second.value.deleted).toBe(0);
    expect(second.value.unchanged).toBe(1);
  });
});
