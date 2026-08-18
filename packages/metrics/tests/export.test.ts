import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportCsv, exportJson } from "../src/metrics-exporter";
import { MetricsService } from "../src/metrics.service";

function tmpMetricsPath(): string {
  const dir = join(tmpdir(), `metrics-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".codeatlas"), { recursive: true });
  return join(dir, ".codeatlas", "metrics.json");
}

describe("MetricsExporter", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  it("exportJson returns valid JSON", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordScan({
      files: 50,
      lines: 2000,
      symbols: 300,
      dependencies: 10,
      languages: { typescript: 40, javascript: 10 },
      latencyMs: 100,
    });
    svc.recordSearch({ latencyMs: 5 });
    const json = exportJson(svc.snapshot());
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.repository.files).toBe(50);
    expect(parsed.activity.searches).toBe(1);
    svc.close();
  });

  it("exportJson writes to file", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    const outPath = join(join(path, "..", ".."), "exported.json");
    exportJson(svc.snapshot(), { outputPath: outPath });
    const content = readFileSync(outPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    cleanup.push(outPath);
    svc.close();
  });

  it("exportCsv returns valid CSV", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordSearch({ latencyMs: 5 });
    svc.recordContextRequest({ latencyMs: 10 });
    const csv = exportCsv(svc.snapshot());
    const lines = csv.split("\n");
    expect(lines[0]).toContain("date");
    expect(lines[0]).toContain("searches");
    expect(lines.length).toBe(2); // header + 1 data row
    svc.close();
  });

  it("exportCsv handles empty daily history", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    const csv = exportCsv(svc.snapshot());
    const lines = csv.split("\n");
    expect(lines.length).toBe(1); // header only
    svc.close();
  });
});
