import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { MetricsService } from "../src/metrics.service";

function tmpMetricsPath(): string {
  const dir = join(tmpdir(), `metrics-svc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".codeatlas"), { recursive: true });
  return join(dir, ".codeatlas", "metrics.json");
}

describe("MetricsService", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  it("starts with empty snapshot", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    const snap = svc.snapshot();
    expect(snap.activity.scans).toBe(0);
    expect(snap.activity.searches).toBe(0);
    svc.close();
  });

  it("recordScan updates repository metrics", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordScan({
      files: 100,
      lines: 5000,
      symbols: 500,
      dependencies: 20,
      languages: { typescript: 80, javascript: 20 },
      latencyMs: 250,
    });
    const snap = svc.snapshot();
    expect(snap.repository.files).toBe(100);
    expect(snap.repository.lines).toBe(5000);
    expect(snap.repository.symbols).toBe(500);
    expect(snap.repository.dependencies).toBe(20);
    expect(snap.repository.languages["typescript"]).toBe(80);
    expect(snap.repository.scanCount).toBe(1);
    expect(snap.repository.firstScanAt).not.toBeNull();
    expect(snap.repository.latestScanAt).not.toBeNull();
    expect(snap.activity.scans).toBe(1);
    expect(snap.performance.averageScanMs).toBe(250);
    svc.close();
  });

  it("recordSearch increments search count", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordSearch({ latencyMs: 15 });
    svc.recordSearch({ latencyMs: 25 });
    const snap = svc.snapshot();
    expect(snap.activity.searches).toBe(2);
    // EMA: 15 * 0.7 + 25 * 0.3 = 10.5 + 7.5 = 18
    expect(snap.performance.averageSearchMs).toBe(18);
    svc.close();
  });

  it("recordContextRequest increments context count", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordContextRequest({ latencyMs: 40 });
    const snap = svc.snapshot();
    expect(snap.activity.contextRequests).toBe(1);
    expect(snap.performance.averageContextMs).toBe(40);
    svc.close();
  });

  it("recordMcpRequest increments MCP count", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordMcpRequest({});
    svc.recordMcpRequest({});
    const snap = svc.snapshot();
    expect(snap.activity.mcpRequests).toBe(2);
    svc.close();
  });

  it("recordFileRead increments file read count", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordFileRead({ filePath: "src/index.ts" });
    const snap = svc.snapshot();
    expect(snap.activity.filesRead).toBe(1);
    svc.close();
  });

  it("recordFileModified increments file modified count", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordFileModified({ filePath: "src/index.ts" });
    const snap = svc.snapshot();
    expect(snap.activity.filesModified).toBe(1);
    svc.close();
  });

  it("recordTokenEstimate accumulates and calculates savings", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordTokenEstimate({ baselineTokens: 1000, codeatlasTokens: 400 });
    svc.recordTokenEstimate({ baselineTokens: 500, codeatlasTokens: 200 });
    const snap = svc.snapshot();
    // Total: baseline 1500, codeatlas 600, saved 900, percent 60%
    expect(snap.tokens.estimatedBaseline).toBe(1500);
    expect(snap.tokens.estimatedCodeatlas).toBe(600);
    expect(snap.tokens.estimatedSaved).toBe(900);
    expect(snap.tokens.savingsPercent).toBe(60);
    svc.close();
  });

  it("recordTokenEstimate handles zero baseline (no division by zero)", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordTokenEstimate({ baselineTokens: 0, codeatlasTokens: 0 });
    const snap = svc.snapshot();
    expect(snap.tokens.savingsPercent).toBe(0);
    svc.close();
  });

  it("daily aggregation creates entries", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordSearch({ latencyMs: 10 });
    svc.recordContextRequest({ latencyMs: 20 });
    const snap = svc.snapshot();
    expect(snap.daily.length).toBe(1);
    expect(snap.daily[0].searches).toBe(1);
    expect(snap.daily[0].contextRequests).toBe(1);
    svc.close();
  });

  it("daily aggregation accumulates on same day", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordSearch({ latencyMs: 10 });
    svc.recordSearch({ latencyMs: 15 });
    const snap = svc.snapshot();
    expect(snap.daily.length).toBe(1);
    expect(snap.daily[0].searches).toBe(2);
    svc.close();
  });

  it("reset clears all metrics", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordScan({
      files: 100,
      lines: 5000,
      symbols: 500,
      dependencies: 20,
      languages: {},
      latencyMs: 100,
    });
    svc.recordSearch({ latencyMs: 10 });
    svc.reset();
    const snap = svc.snapshot();
    expect(snap.activity.scans).toBe(0);
    expect(snap.activity.searches).toBe(0);
    expect(snap.repository.scanCount).toBe(0);
    svc.close();
  });

  it("flush persists to disk", () => {
    const path = tmpMetricsPath();
    cleanup.push(join(path, "..", ".."));
    const svc = new MetricsService({ filePath: path });
    svc.recordSearch({ latencyMs: 10 });
    svc.flush();
    // Load from a new service to verify persistence
    const svc2 = new MetricsService({ filePath: path });
    const snap = svc2.snapshot();
    expect(snap.activity.searches).toBe(1);
    svc.close();
    svc2.close();
  });
});
