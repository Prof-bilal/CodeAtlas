import { type Result, fail, ok } from "@atlas/shared";

/**
 * JSONC support for the Tool Configurator (ADR-010). OpenCode reads its global
 * config from `~/.config/opencode/opencode.jsonc` — JSON with `//` line
 * comments, block comments, and optional trailing commas. CodeAtlas merges
 * into that file as a JSON document (JSON is valid JSONC), so unrelated user
 * keys are preserved; the original (commented) file is backed up before any
 * write.
 */

/** Remove `//` line comments and block comments from a JSONC document,
 *  respecting string literals (a comment marker inside a string is left
 *  untouched). */
export function stripJsoncComments(raw: string): string {
  let out = "";
  let i = 0;
  const n = raw.length;
  let inString = false;
  while (i < n) {
    const ch = raw[i] as string;
    const next = raw[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && raw[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(raw[i] === "*" && raw[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Remove trailing commas before `}` or `]` outside string literals. */
export function stripTrailingCommas(raw: string): string {
  let out = "";
  let i = 0;
  const n = raw.length;
  let inString = false;
  while (i < n) {
    const ch = raw[i] as string;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += raw[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < n && /\s/.test(raw[j] as string)) j += 1;
      if (j < n && (raw[j] === "}" || raw[j] === "]")) {
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Parse a JSONC document (comments + trailing commas allowed) into a value. */
export function parseJsonc(raw: string): Result<unknown> {
  const cleaned = stripTrailingCommas(stripJsoncComments(raw));
  try {
    return ok(JSON.parse(cleaned) as unknown);
  } catch (error) {
    return fail(new Error(error instanceof Error ? error.message : String(error)));
  }
}
