import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_DIR_NAME,
  MANIFEST_FILE_NAME,
  MANIFEST_VERSION,
  type ProjectManifest,
  detectPackageManager,
  generateManifest,
  loadManifest,
} from "../src/manifest";
import { scanProject } from "../src/scanner.service";
import { createTestProject } from "./helpers";

const T1 = new Date("2024-01-15T10:00:00.000Z");
const T2 = new Date("2024-02-20T12:30:00.000Z");

async function scanProjectAt(root: string) {
  const result = await scanProject(root as FilePath);
  if (!result.ok) {
    throw new Error("scan failed in manifest test");
  }
  return result.value;
}

describe("detectPackageManager", () => {
  it("detects managers from lockfiles", () => {
    expect(detectPackageManager(["pnpm-lock.yaml"])).toBe("pnpm");
    expect(detectPackageManager(["yarn.lock"])).toBe("yarn");
    expect(detectPackageManager(["package-lock.json"])).toBe("npm");
    expect(detectPackageManager(["bun.lockb"])).toBe("bun");
    expect(detectPackageManager(["deno.json"])).toBe("deno");
  });

  it("falls back to npm for a package.json without a lockfile", () => {
    expect(detectPackageManager(["package.json"])).toBe("npm");
  });

  it("returns null for non-Node projects", () => {
    expect(detectPackageManager(["src", "go.mod"])).toBeNull();
  });
});

describe("generateManifest", () => {
  it("writes .codeatlas/manifest.json with scan metadata", async () => {
    const project = createTestProject({
      "package.json": JSON.stringify({ name: "demo", scripts: { build: "x" } }),
      "pnpm-lock.yaml": "",
      "src/index.ts": "export const x = 1;",
    });
    try {
      const scan = await scanProjectAt(project.root);
      const result = await generateManifest(scan, {
        rootPath: project.root,
        scannerVersion: "1.2.3",
        now: T1,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { manifest, path } = result.value;
      const expectedPath = join(project.root, MANIFEST_DIR_NAME, MANIFEST_FILE_NAME);
      expect(path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      expect(manifest.manifestVersion).toBe(MANIFEST_VERSION);
      expect(manifest.name).toBe(basename(project.root));
      expect(manifest.languages).toContain("typescript");
      expect(manifest.languages).toContain("json");
      expect(manifest.framework).toBe("node.js");
      expect(manifest.packageManager).toBe("pnpm");
      expect(manifest.scannerVersion).toBe("1.2.3");
      expect(manifest.totalFiles).toBe(3);
      expect(manifest.totalFolders).toBe(1);
      expect(manifest.createdAt).toBe(T1.toISOString());
      expect(manifest.updatedAt).toBe(T1.toISOString());
      expect(manifest.git.isRepository).toBe(false);
      expect(manifest.git.branch).toBeNull();
    } finally {
      project.cleanup();
    }
  });

  it("preserves createdAt but refreshes updatedAt on subsequent runs", async () => {
    const project = createTestProject({ "src/index.ts": "x" });
    try {
      const scan = await scanProjectAt(project.root);

      const first = await generateManifest(scan, {
        rootPath: project.root,
        now: T1,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const second = await generateManifest(scan, {
        rootPath: project.root,
        now: T2,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.value.manifest.createdAt).toBe(T1.toISOString());
      expect(second.value.manifest.updatedAt).toBe(T2.toISOString());
    } finally {
      project.cleanup();
    }
  });

  it("loads the manifest back from disk intact", async () => {
    const project = createTestProject({ "src/index.ts": "x" });
    try {
      const scan = await scanProjectAt(project.root);
      await generateManifest(scan, { rootPath: project.root, now: T1 });

      const path = join(project.root, MANIFEST_DIR_NAME, MANIFEST_FILE_NAME);
      const loaded = await loadManifest(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok || loaded.value === null) return;
      expect(loaded.value.name).toBe(basename(project.root));
      expect((loaded.value as ProjectManifest).manifestVersion).toBe(MANIFEST_VERSION);
    } finally {
      project.cleanup();
    }
  });

  it("returns null from loadManifest for a missing file", async () => {
    const loaded = await loadManifest(join("C:/nope", MANIFEST_DIR_NAME, MANIFEST_FILE_NAME));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toBeNull();
  });

  it("serializes as pretty-printed JSON on disk", async () => {
    const project = createTestProject({ "a.ts": "x" });
    try {
      const scan = await scanProjectAt(project.root);
      await generateManifest(scan, { rootPath: project.root, now: T1 });

      const path = join(project.root, MANIFEST_DIR_NAME, MANIFEST_FILE_NAME);
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as ProjectManifest;
      expect(parsed).toBeDefined();
      expect(raw).toContain('"manifestVersion"');
    } finally {
      project.cleanup();
    }
  });
});
