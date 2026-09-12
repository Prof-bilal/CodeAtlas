import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCheckCache {
  readonly checkedAt: string;
  readonly latestVersion: string;
}

function getConfigDir(): string {
  return join(homedir(), ".codeatlas");
}

function getCachePath(): string {
  return join(getConfigDir(), ".update-check.json");
}

async function readCache(): Promise<UpdateCheckCache | null> {
  try {
    const raw = await readFile(getCachePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)["checkedAt"] === "string" &&
      typeof (parsed as Record<string, unknown>)["latestVersion"] === "string"
    ) {
      return parsed as UpdateCheckCache;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(cache: UpdateCheckCache): Promise<void> {
  try {
    await mkdir(getConfigDir(), { recursive: true });
    await writeFile(getCachePath(), JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // Best-effort: ignore write failures
  }
}

function compareVersions(current: string, latest: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.-]/)
      .map((p) => {
        const n = Number(p);
        return Number.isNaN(n) ? 0 : n;
      });
  const a = parse(current);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("npm", ["view", "codeatlas-cli", "version"], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const version = stdout.trim();
      resolve(version.length > 0 ? version : null);
    });
  });
}

export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    const cache = await readCache();
    if (cache !== null) {
      const elapsed = Date.now() - new Date(cache.checkedAt).getTime();
      if (elapsed < CHECK_INTERVAL_MS) {
        if (compareVersions(currentVersion, cache.latestVersion) < 0) {
          printNotice(currentVersion, cache.latestVersion);
        }
        return;
      }
    }

    const latest = await fetchLatestVersion();
    if (latest === null) return;

    await writeCache({ checkedAt: new Date().toISOString(), latestVersion: latest });

    if (compareVersions(currentVersion, latest) < 0) {
      printNotice(currentVersion, latest);
    }
  } catch {
    // Silent: update check must never block the CLI
  }
}

function printNotice(current: string, latest: string): void {
  console.log(`\n  Update available: ${current} → ${latest}`);
  console.log("  Run `npm install -g codeatlas-cli` to update\n");
}
