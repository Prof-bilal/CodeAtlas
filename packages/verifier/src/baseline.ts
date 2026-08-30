import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CommandRunResult } from "@atlas/core";

const BASELINE_FILENAME = "verify-baseline.json";

interface BaselineEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  /** Fingerprint of the project state when baseline was captured. */
  readonly fingerprint: string;
}

interface BaselineFile {
  readonly fingerprint: string;
  readonly entries: readonly BaselineEntry[];
  readonly capturedAt: string;
}

export interface BaselineDeps {
  /** Compute a fingerprint of the project state (e.g. file hashes, git HEAD). */
  readonly computeFingerprint: (cwd: string) => Promise<string>;
}

function baselineKey(entry: { command: string; args: readonly string[] }): string {
  return `${entry.command} ${entry.args.join(" ")}`;
}

export function loadBaseline(cwd: string): BaselineFile | undefined {
  const baselinePath = resolve(cwd, ".codeatlas", BASELINE_FILENAME);
  if (!existsSync(baselinePath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(readFileSync(baselinePath, "utf-8"));
    if (typeof raw !== "object" || raw === null) return undefined;
    if (typeof raw.fingerprint !== "string") return undefined;
    if (!Array.isArray(raw.entries)) return undefined;
    return raw as BaselineFile;
  } catch {
    return undefined;
  }
}

export function saveBaseline(
  cwd: string,
  fingerprint: string,
  results: readonly CommandRunResult[],
): void {
  const baselinePath = resolve(cwd, ".codeatlas", BASELINE_FILENAME);
  const dir = dirname(baselinePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const baseline: BaselineFile = {
    fingerprint,
    entries: results.map((r) => ({
      command: r.command,
      args: [...r.args],
      exitCode: r.exitCode,
      fingerprint,
    })),
    capturedAt: new Date().toISOString(),
  };

  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), "utf-8");
}

export async function classifyResults(
  results: readonly CommandRunResult[],
  cwd: string,
  deps: BaselineDeps,
): Promise<readonly CommandRunResult[]> {
  const baseline = loadBaseline(cwd);
  const currentFingerprint = await deps.computeFingerprint(cwd);

  if (!baseline) {
    // No baseline: all failures are pre-existing (we can't tell)
    return results.map((r) => ({
      ...r,
      preExisting: r.exitCode !== 0,
    }));
  }

  if (baseline.fingerprint !== currentFingerprint) {
    // Project state changed since baseline: reclassify
    const baselineMap = new Map<string, BaselineEntry>();
    for (const entry of baseline.entries) {
      baselineMap.set(baselineKey(entry), entry);
    }

    return results.map((r) => {
      const key = baselineKey(r);
      const base = baselineMap.get(key);
      // If the same command was already failing in the baseline, it's pre-existing
      const preExisting = base !== undefined && base.exitCode !== 0 && r.exitCode !== 0;
      return { ...r, preExisting };
    });
  }

  // Fingerprint matches: compare against baseline to classify
  const baselineMap = new Map<string, BaselineEntry>();
  for (const entry of baseline.entries) {
    baselineMap.set(baselineKey(entry), entry);
  }

  return results.map((r) => {
    const key = baselineKey(r);
    const base = baselineMap.get(key);
    if (r.exitCode === 0) {
      // Passing: never pre-existing
      return { ...r, preExisting: false };
    }
    // Failing: pre-existing only if the baseline also shows this command failing
    const preExisting = base !== undefined && base.exitCode !== 0;
    return { ...r, preExisting };
  });
}
