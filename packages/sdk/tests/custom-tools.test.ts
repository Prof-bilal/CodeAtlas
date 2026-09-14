import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createToolkitSDK } from "../src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

const tool = {
  name: "internal-audit",
  description: "A private audit helper.",
  license: "MIT",
  version: "1.0.0",
  categories: ["Security"],
  repository: "https://example.com/internal-audit",
  installMethods: [{ type: "npm", packageId: "internal-audit" }],
};

describe("custom tool overlay workflow", () => {
  it("creates a validated custom tool template", () => {
    const sdk = createToolkitSDK();
    const result = sdk.createCustomToolTemplate({
      name: "template-tool",
      description: "A generated custom tool.",
      license: "MIT",
      categories: ["Testing"],
      installType: "npm",
      packageId: "template-tool",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("template-tool");
      expect(result.value.installMethods[0]?.type).toBe("npm");
    }
  });

  it("rejects invalid install types in generated templates", () => {
    const sdk = createToolkitSDK();
    const result = sdk.createCustomToolTemplate({
      name: "bad-template",
      description: "A bad custom tool.",
      license: "MIT",
      categories: ["Testing"],
      installType: "shell",
    });
    expect(result.ok).toBe(false);
  });

  it("validates, persists, and reloads one custom tool", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-tool-"));
    roots.push(root);
    const sdk = createToolkitSDK({ root });

    const validated = sdk.validateCustomTool(tool);
    expect(validated.ok).toBe(true);

    const added = await sdk.addCustomTool(tool);
    expect(added.ok).toBe(true);
    expect(existsSync(join(root, ".codeatlas", "tools-overlay.json"))).toBe(true);

    const reloaded = createToolkitSDK({ root });
    expect(reloaded.registry.getTool("internal-audit")?.trust).toBe("unverified");
    expect(
      JSON.parse(readFileSync(join(root, ".codeatlas", "tools-overlay.json"), "utf8")),
    ).toEqual(expect.objectContaining({ schemaVersion: 2 }));
  });

  it("rejects duplicate names unless replacement is explicit", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-tool-"));
    roots.push(root);
    const sdk = createToolkitSDK({ root });

    expect((await sdk.addCustomTool(tool)).ok).toBe(true);
    const duplicate = await sdk.addCustomTool(tool);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.message).toContain("replace explicitly");
    expect((await sdk.addCustomTool({ ...tool, version: "2.0.0" }, { replace: true })).ok).toBe(
      true,
    );
  });

  it("reports malformed custom definitions without writing them", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-tool-"));
    roots.push(root);
    const sdk = createToolkitSDK({ root });
    const result = await sdk.addCustomTool({ name: "bad" });

    expect(result.ok).toBe(false);
    expect(existsSync(join(root, ".codeatlas", "tools-overlay.json"))).toBe(false);
  });
});
