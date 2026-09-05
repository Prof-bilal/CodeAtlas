// @atlas/benchmark — Skills loader
//
// Dependency-free discovery + loading + rendering of Agent Skills. Follows the
// open standard's three progressive-disclosure stages:
//   1. Discovery  — only name + description are surfaced (cheap to keep around).
//   2. Activation — the full SKILL.md body is read into context when relevant.
//   3. Execution  — the agent follows the instructions; references may be read.
//
// Safety: skill names must be path-safe (never escape the skills root);
// frontmatter is parsed with a minimal YAML-subset parser (no dependency);
// reference files are size-bounded and read-only (never executed).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  DiscoveredSkill,
  Skill,
  SkillManifest,
  SkillReference,
  SkillResolution,
} from "./types";

/** Maximum bytes read from a single reference file. */
export const MAX_SKILL_REFERENCE_BYTES = 64 * 1024;
/** Maximum bytes read from SKILL.md. */
export const MAX_SKILL_MARKDOWN_BYTES = 512 * 1024;
/** Reference files above this many total entries are truncated. */
export const MAX_REFERENCE_FILES = 32;

const SKILL_MD = "SKILL.md";

// ---------------------------------------------------------------------------
// Frontmatter parsing (minimal YAML subset — key: value lines, no nesting)
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Parse a `---`-delimited frontmatter block plus the remaining body. Returns
 * null when the file has no valid frontmatter header.
 */
export function splitFrontmatter(
  raw: string,
): { manifest: Record<string, string | string[] | boolean>; body: string } | null {
  const match = FRONTMATTER_RE.exec(raw);
  if (match === null) return null;
  const block = match[1];
  const body = raw.slice(match[0].length);
  const manifest: Record<string, string | string[] | boolean> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value === "") continue;
    manifest[key] = parseScalar(value);
  }
  return { manifest, body: body.trimStart() };
}

function parseScalar(value: string): string | string[] | boolean {
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x !== "");
  }
  return value;
}

/** A path-safe skill identifier may contain `[a-z0-9_-]` only. */
export function isValidSkillId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(id);
}

// ---------------------------------------------------------------------------
// Discovery (stage 1) — surface only metadata.
// ---------------------------------------------------------------------------

/**
 * Discover skills in `dir`: for each immediate subdirectory containing a
 * SKILL.md, return a lightweight `DiscoveredSkill`. Subdirectories without a
 * valid SKILL.md (or with a non-path-safe name) plus malformed frontmatter are
 * skipped. Never throws for missing/empty dirs.
 */
export function discoverSkills(dir: string): DiscoveredSkill[] {
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const discovered: DiscoveredSkill[] = [];
  for (const entry of entries) {
    if (!isValidSkillId(entry)) continue;
    const skillDir = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(skillDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const skill = tryReadSkill(skillDir, entry);
    if (skill === null) continue;
    discovered.push({
      id: skill.id,
      name: skill.manifest.name,
      description: skill.manifest.description,
      path: skill.path,
      ...(skill.manifest.version !== undefined ? { version: skill.manifest.version } : {}),
    });
  }
  discovered.sort((a, b) => a.id.localeCompare(b.id));
  return discovered;
}

// ---------------------------------------------------------------------------
// Loading (stage 2) — read the full skill.
// ---------------------------------------------------------------------------

/**
 * Load a single skill by id from `dir`. Returns null when the directory does
 * not exist or the skill is invalid. Loading reads SKILL.md plus bounded
 * `references/` support files; nothing is executed.
 */
export function loadSkill(dir: string, id: string): Skill | null {
  if (!isValidSkillId(id)) return null;
  return tryReadSkill(join(dir, id), id);
}

/**
 * Load a single skill from an absolute directory path. `id` is derived from
 * the directory basename. Returns null on any load/validation failure.
 */
export function tryReadSkill(skillDir: string, id: string): Skill | null {
  const mdPath = join(skillDir, SKILL_MD);
  if (!existsSync(mdPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(mdPath, "utf-8");
  } catch {
    return null;
  }
  if (raw.length > MAX_SKILL_MARKDOWN_BYTES) return null;

  const parsed = splitFrontmatter(raw);
  if (parsed === null) return null;
  const manifest = normalizeManifest(parsed.manifest);
  if (!isValidSkillId(manifest.name) || manifest.name !== id) {
    // Frontmatter `name` must match the directory to stay unambiguous.
    return null;
  }
  if (manifest.description === "") return null;

  const references = loadReferences(skillDir);
  return {
    id,
    manifest,
    body: parsed.body,
    path: skillDir,
    references,
  };
}

// ---------------------------------------------------------------------------
// Rendering (stage 3 helper) — compile instructions for the agent prompt.
// ---------------------------------------------------------------------------

/**
 * Render a skill (metadata + body, then its reference files) into a single
 * markdown instruction block suitable for prepending to a task prompt. Returns
 * an empty string when `skill` is null. Accepts both a fully-loaded `Skill` and
 * a lightweight `DiscoveredSkill` (metadata only).
 */
export function renderSkillInstructions(
  skill: Skill | DiscoveredSkill | null,
  options?: { readonly includeReferences?: boolean },
): string {
  if (skill === null) return "";
  if (!("manifest" in skill)) {
    // DiscoveredSkill — no full body was loaded.
    const meta: string[] = ["## Reusable skill applied to this task", ""];
    meta.push(`Name: ${skill.name}`);
    meta.push(`Description: ${skill.description}`);
    if (skill.version !== undefined) meta.push(`Version: ${skill.version}`);
    meta.push("");
    meta.push(
      "This skill matched the task but was not preloaded. Load its full SKILL.md " +
        "instructions before executing the task.",
    );
    return meta.join("\n");
  }
  const includeRefs = options?.includeReferences ?? true;
  const parts: string[] = [];
  parts.push("## Reusable skill applied to this task");
  parts.push("");
  parts.push(`Name: ${skill.manifest.name}`);
  parts.push(`Description: ${skill.manifest.description}`);
  if (skill.manifest.version !== undefined) parts.push(`Version: ${skill.manifest.version}`);
  if (skill.manifest.allowedTools !== undefined && skill.manifest.allowedTools.length > 0) {
    parts.push(`Relevant tools: ${skill.manifest.allowedTools.join(", ")}`);
  }
  parts.push("");
  parts.push("Follow these instructions for this task where relevant:");
  parts.push("");
  parts.push(skill.body.trimEnd());
  if (includeRefs && skill.references.length > 0) {
    parts.push("");
    parts.push("### Skill reference material");
    for (const ref of skill.references) {
      parts.push("");
      parts.push(`<!-- reference: ${ref.relPath} -->`);
      parts.push(ref.content.trimEnd());
    }
  }
  return parts.join("\n");
}

/**
 * Return human-readable validation problems for a skill directory. Empty when
 * the skill is valid. Complements `tryReadSkill` with diagnostics.
 */
export function validateSkill(dir: string, id: string): string[] {
  if (!isValidSkillId(id)) return [`invalid skill id: "${id}"`];
  const skillDir = join(dir, id);
  const mdPath = join(skillDir, SKILL_MD);
  if (!existsSync(mdPath)) return [`missing ${SKILL_MD} in ${id}`];
  const raw = readFileSync(mdPath, "utf-8");
  const problems: string[] = [];
  if (raw.length > MAX_SKILL_MARKDOWN_BYTES) {
    problems.push(`${SKILL_MD} exceeds ${MAX_SKILL_MARKDOWN_BYTES} bytes`);
  }
  const parsed = splitFrontmatter(raw);
  if (parsed === null) {
    problems.push(`${SKILL_MD} has no frontmatter block`);
    return problems;
  }
  const manifest = normalizeManifest(parsed.manifest);
  if (manifest.name !== id) {
    problems.push(`frontmatter name "${manifest.name}" != directory "${id}"`);
  }
  if (manifest.description === "") problems.push("missing frontmatter description");
  return problems;
}

// ---------------------------------------------------------------------------
// Resolution — choose an applicable skill for a task.
// ---------------------------------------------------------------------------

/**
 * Resolve a skill for a task. A task may name a skill explicitly (`task.skill`),
 * in which case an exact id/name match wins; otherwise the candidate whose
 * description shares the most significant terms with the task prompt is chosen.
 */
export function resolveSkillForTask(
  skills: ReadonlyArray<Skill | DiscoveredSkill>,
  task: {
    readonly skill?: string | undefined;
    readonly description?: string | undefined;
    readonly prompt?: string;
  },
): SkillResolution {
  const none: SkillResolution = {
    skill: null,
    renderedInstructions: "",
    loaded: false,
    reason: "none",
  };
  if (skills.length === 0) return none;
  if (task.skill !== undefined && task.skill !== "") {
    const exact = skills.find((s) => s.id === task.skill || skillName(s) === task.skill);
    if (exact !== undefined) {
      return {
        skill: exact,
        renderedInstructions: renderSkillInstructions(exact),
        loaded: "manifest" in exact,
        reason: "name-match",
      };
    }
  }
  const haystack = `${task.prompt ?? ""} ${task.description ?? ""}`.toLowerCase();
  const terms = uniqueTerms(haystack);
  let best: Skill | DiscoveredSkill | null = null;
  let bestScore = 0;
  for (const s of skills) {
    const desc = skillDescription(s).toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (t.length >= 5 && desc.includes(t)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best === null || bestScore === 0) return none;
  return {
    skill: best,
    renderedInstructions: renderSkillInstructions(best),
    loaded: "manifest" in best,
    reason: "description-match",
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function normalizeManifest(raw: Record<string, string | string[] | boolean>): SkillManifest {
  const str = (k: string): string | undefined => {
    const v = raw[k];
    return typeof v === "string" ? v : undefined;
  };
  const list = (k: string): string[] | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v.map((x) => String(x)) : undefined;
  };
  const bool = (k: string): boolean | undefined => {
    const v = raw[k];
    return typeof v === "boolean" ? v : undefined;
  };
  return {
    name: str("name") ?? "",
    description: str("description") ?? "",
    ...(str("version") !== undefined ? { version: str("version") } : {}),
    ...(list("allowed-tools") !== undefined ? { allowedTools: list("allowed-tools") } : {}),
    ...(list("disallowed-tools") !== undefined
      ? { disallowedTools: list("disallowed-tools") }
      : {}),
    ...(bool("disable-model-invocation") !== undefined
      ? { disableModelInvocation: bool("disable-model-invocation") }
      : {}),
  };
}

/** Recursively collect `references/` files (bounded). */
function loadReferences(skillDir: string): SkillReference[] {
  const refsDir = join(skillDir, "references");
  if (!existsSync(refsDir)) return [];
  const refs: SkillReference[] = [];
  walkReferences(refsDir, refsDir, refs, 0);
  return refs;
}

function walkReferences(root: string, dir: string, out: SkillReference[], depth: number): void {
  if (depth > 3 || out.length >= MAX_REFERENCE_FILES) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  entries.sort();
  for (const entry of entries) {
    if (out.length >= MAX_REFERENCE_FILES) return;
    const p = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkReferences(root, p, out, depth + 1);
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > MAX_SKILL_REFERENCE_BYTES) continue;
    let content: string;
    try {
      content = readFileSync(p, "utf-8");
    } catch {
      continue;
    }
    const rel = p.slice(root.length + 1).replace(/\\/g, "/");
    out.push({ relPath: rel, content });
  }
}

/** Extract de-duplicated, significant alphanumeric terms from a string. */
function uniqueTerms(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/[a-zA-Z0-9][a-zA-Z0-9_-]{3,}/g)) {
    const t = m[0].toLowerCase();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Read the display name from either a loaded or a discovered skill record. */
function skillName(s: Skill | DiscoveredSkill): string {
  return "name" in s ? s.name : s.manifest.name;
}

/** Read the description from either a loaded or a discovered skill record. */
function skillDescription(s: Skill | DiscoveredSkill): string {
  return "description" in s ? s.description : s.manifest.description;
}

export { SKILL_MD as SKILL_FILENAME };
