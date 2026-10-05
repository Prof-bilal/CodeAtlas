import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type IndexResult, createWatcher, indexProject } from "../src/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for watcher");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("createWatcher", () => {
  it("incrementally re-indexes after a debounced file change", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-watch-"));
    roots.push(root);
    const file = join(root, "app.ts");
    await writeFile(file, "export const a = 1;\n");
    const build = await indexProject({ repositoryPath: root, mode: "build" });
    expect(build.ok).toBe(true);

    const results: IndexResult[] = [];
    const watcher = createWatcher({
      repositoryPath: root,
      debounceMs: 50,
      onIndex: (result) => {
        if (result.ok) {
          results.push(result.value);
        }
      },
    });
    await watcher.start();
    try {
      await writeFile(file, "export const a = 2;\nexport const b = 3;\n");
      await waitFor(() => results.length > 0);
      expect(results.at(-1)?.changed).toBe(1);
      expect(results.at(-1)?.symbols).toBeGreaterThanOrEqual(2);
    } finally {
      await watcher.close();
    }
  });
});
