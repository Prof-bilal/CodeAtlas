import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The result of running an `atlas` CLI command from the extension. */
export interface AtlasRunResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Locate the built `atlas` CLI to invoke. Precedence:
 * 1. `ATLAS_CLI_JS` env var (absolute path to the built ESM entry).
 * 2. `<projectRoot>/apps/cli/dist/index.js` and `<projectRoot>/.bin/atlas`
 *    (workspace-root–relative lookups, robust to nested project roots).
 * Returns `null` when none exists so the caller can raise a clear error.
 */
export function resolveAtlasCli(projectRoot: string, workspaceRoot?: string): string | null {
  const explicit = process.env["ATLAS_CLI_JS"];
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit;
  }
  const roots = [resolve(projectRoot)];
  if (workspaceRoot !== undefined) {
    roots.unshift(resolve(workspaceRoot));
  }
  for (const root of roots) {
    const candidates = [
      join(root, "apps", "cli", "dist", "index.js"),
      join(root, "packages", "cli", "dist", "index.js"),
      join(root, "node_modules", ".bin", "atlas"),
    ];
    // Reproject one level up from a project-rooted path (repo = parent of project).
    const parent = resolve(root, "..", "..");
    candidates.push(join(parent, "apps", "cli", "dist", "index.js"));
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Run an `atlas` subcommand (e.g. `build` or `update`) and capture its output.
 * The CLI is invoked via `process.execPath` + the resolved entry so it works
 * even when the host doesn't have the `.bin` shim on PATH.
 */
export function runAtlas(args: {
  readonly projectRoot: string;
  readonly workspaceRoot?: string;
  readonly command: string;
  readonly extraArgs?: readonly string[];
  readonly timeoutMs?: number;
}): Promise<AtlasRunResult> {
  const { projectRoot, workspaceRoot, command, extraArgs = [], timeoutMs = 120_000 } = args;
  return new Promise((resolvePromise, reject) => {
    const cli = resolveAtlasCli(projectRoot, workspaceRoot);
    if (cli === null) {
      reject(
        new Error(
          "CodeAtlas CLI not found. Build it first (`pnpm --filter codeatlas-cli build`) or set ATLAS_CLI_JS to its dist/index.js.",
        ),
      );
      return;
    }
    const child = spawn(process.execPath, [cli, command, ...extraArgs], {
      cwd: projectRoot,
      env: { ...process.env, ATLAS_ROOT: projectRoot },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`atlas ${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        command,
        args: extraArgs,
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
