import { constants, accessSync } from "node:fs";
import { basename, delimiter, extname, isAbsolute, join } from "node:path";

/**
 * Resolve an executable name to an absolute path by scanning `PATH`, honoring
 * `PATHEXT` on Windows. Returns `null` when the binary is not installed. No
 * process is spawned — pure filesystem detection.
 */
export function findExecutable(
  binary: string,
  options: { pathEnv?: string; pathext?: string } = {},
): string | null {
  const pathEnv = options.pathEnv ?? process.env["PATH"] ?? "";
  const pathext = options.pathext ?? process.env["PATHEXT"] ?? "";

  // Absolute path or a path with separators: check it directly.
  if (isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) {
    return isExecutable(binary) ? binary : null;
  }

  const dirs = pathEnv.split(delimiter).filter((dir) => dir.length > 0);
  const extensions =
    process.platform === "win32" ? pathext.split(";").filter((e) => e.length > 0) : [""];
  const candidates: string[] = [];
  for (const dir of dirs) {
    for (const ext of extensions) {
      // Only append an extension if the binary does not already carry one.
      const candidate = extname(binary) === "" ? `${binary}${ext}` : binary;
      candidates.push(join(dir, candidate));
    }
  }
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return basename(path) !== "";
  } catch {
    return false;
  }
}
