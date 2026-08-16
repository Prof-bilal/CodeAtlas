import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { MetricsService } from "../src/metrics.service";

/**
 * Privacy tests — proving that metrics do NOT contain:
 * - source code
 * - API keys
 * - environment variables
 * - secrets
 * - file contents
 * - prompts
 */
function tmpMetricsPath(): string {
  const dir = join(
    tmpdir(),
    `metrics-privacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(dir, ".codeatlas"), { recursive: true });
  return join(dir, ".codeatlas", "metrics.json");
}

describe("Privacy: metrics do not contain sensitive data", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  it("does not store source code in file read events", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordFileRead({ filePath: "src/index.ts" });
    const snap = svc.snapshot();
    // Only the count is tracked, not the path or content
    expect(snap.activity.filesRead).toBe(1);
    // Read the raw JSON to verify
    const raw = readFileSync(path, "utf-8");
    expect(raw).not.toContain("src/index.ts");
    svc.close();
  });

  it("does not store source code in file modify events", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordFileModified({ filePath: "src/index.ts" });
    const raw = readFileSync(path, "utf-8");
    expect(raw).not.toContain("src/index.ts");
    svc.close();
  });

  it("does not store API keys or secrets", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordScan({
      files: 10,
      lines: 500,
      symbols: 50,
      dependencies: 5,
      languages: { typescript: 10 },
      latencyMs: 100,
    });
    const raw = readFileSync(path, "utf-8");
    // Should not contain actual API key patterns
    expect(raw).not.toContain("sk-");
    expect(raw).not.toContain("api_key");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("secret_key");
    // Note: "token" appears in field names like "tokensused" — that's expected
    // and is NOT a leaked secret.
    svc.close();
  });

  it("does not store environment variables", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordScan({
      files: 10,
      lines: 500,
      symbols: 50,
      dependencies: 5,
      languages: {},
      latencyMs: 100,
    });
    const raw = readFileSync(path, "utf-8");
    const lower = raw.toLowerCase();
    expect(lower).not.toContain("env_");
    expect(lower).not.toContain("process.env");
    svc.close();
  });

  it("does not store prompts or content", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordContextRequest({
      estimatedTokens: 500,
      latencyMs: 40,
    });
    const raw = readFileSync(path, "utf-8");
    expect(raw).not.toContain("prompt");
    expect(raw).not.toContain("content");
    expect(raw).not.toContain("hello world");
    svc.close();
  });

  it("does not store absolute file paths in activity events", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordFileRead({ filePath: "/Users/secret/admin/important.ts" });
    svc.recordFileModified({ filePath: "/Users/secret/admin/important.ts" });
    const raw = readFileSync(path, "utf-8");
    expect(raw).not.toContain("/Users/secret");
    expect(raw).not.toContain("important.ts");
    svc.close();
  });
});
