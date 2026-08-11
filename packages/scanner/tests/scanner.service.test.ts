import { basename, join } from "node:path";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ScannerService, scanProject } from "../src/scanner.service";
import { createTestProject } from "./helpers";

describe("ScannerService.scanProject", () => {
  it("returns structured metadata for a project", async () => {
    const project = createTestProject({
      "package.json": JSON.stringify({
        name: "demo",
        dependencies: { next: "^14.0.0" },
      }),
      "tsconfig.json": "{}",
      "README.md": "# demo",
      "src/index.ts": "export const x = 1;",
      "src/styles.css": "body {}",
      "lib/helper.js": "module.exports = 1;",
      "data.json": "{}",
    });
    try {
      const result = await scanProject(project.root as FilePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scan = result.value;
      expect(scan.name).toBe(basename(project.root));
      expect(scan.totalFiles).toBe(7);
      expect(scan.totalFolders).toBe(2); // src + lib
      expect(scan.framework).toBe("next.js");
      expect(scan.hasPackageJson).toBe(true);
      expect(scan.hasTsconfig).toBe(true);
      expect(scan.hasReadme).toBe(true);

      const names = scan.files.map((file) => file.name);
      expect(names).toContain("index.ts");
      expect(names).toContain("helper.js");

      const jsonTypes = scan.fileTypes.find((type) => type.extension === "json");
      expect(jsonTypes?.count).toBe(3);

      const tsLanguage = scan.languages.find((language) => language.name === "typescript");
      expect(tsLanguage?.fileCount).toBe(1);
    } finally {
      project.cleanup();
    }
  });

  it("ignores node_modules, .git, dist, build, .next, coverage, and vendor", async () => {
    const project = createTestProject({
      "src/index.ts": "x",
      "node_modules/pkg/index.js": "x",
      ".git/HEAD": "ref: refs/heads/main",
      "dist/bundle.js": "x",
      "build/out.js": "x",
      ".next/build.js": "x",
      "coverage/lcov.info": "x",
      "vendor/lib.js": "x",
    });
    try {
      const result = await scanProject(project.root as FilePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalFiles).toBe(1); // only src/index.ts
      expect(result.value.totalFolders).toBe(1); // only src
      expect(result.value.isGitRepository).toBe(true); // .git detected as marker
    } finally {
      project.cleanup();
    }
  });

  it("respects a custom ignoredDirectories list", async () => {
    const project = createTestProject({
      "keep/index.ts": "x",
      "temp/cache.json": "{}",
    });
    try {
      const service = new ScannerService({ ignoredDirectories: ["temp"] });
      const result = await service.scanProject(project.root as FilePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalFiles).toBe(1);
      expect(result.value.files[0]?.name).toBe("index.ts");
    } finally {
      project.cleanup();
    }
  });

  it("respects maxDepth to limit recursion", async () => {
    const project = createTestProject({
      "root.ts": "x",
      "src/a.ts": "x",
      "src/deep/b.ts": "x",
    });
    try {
      const service = new ScannerService({ maxDepth: 0 });
      const result = await service.scanProject(project.root as FilePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalFiles).toBe(1); // only root.ts
    } finally {
      project.cleanup();
    }
  });

  it("returns a failure for a nonexistent path", async () => {
    const result = await scanProject("/definitely/not/here" as FilePath);
    expect(result.ok).toBe(false);
  });

  it("builds a file tree with folders before files", async () => {
    const project = createTestProject({
      "z.txt": "z",
      "a/b.ts": "b",
    });
    try {
      const result = await scanProject(project.root as FilePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const first = result.value.tree[0];
      expect(first?.type).toBe("directory");
      expect(first?.name).toBe("a");
    } finally {
      project.cleanup();
    }
  });
});

describe("ScannerService.readFile", () => {
  it("reads a file and detects its language", async () => {
    const project = createTestProject({ "app.ts": "export const n = 1;" });
    try {
      const service = new ScannerService();
      const filePath = join(project.root, "app.ts") as FilePath;
      const result = await service.readFile(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.language).toBe("typescript");
      expect(result.value.content).toContain("export const n");
    } finally {
      project.cleanup();
    }
  });

  it("fails when the file does not exist", async () => {
    const service = new ScannerService();
    const result = await service.readFile("/nope/missing.ts" as FilePath);
    expect(result.ok).toBe(false);
  });
});
