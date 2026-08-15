import { type Result, fail, ok } from "@atlas/shared";

/**
 * Minimal TOML support for the Tool Configurator (ADR-010). The Codex CLI
 * reads its user config from `~/.codex/config.toml`, so the Codex adapter
 * writes `[mcp_servers.codeatlas]` into a real TOML document.
 *
 * Two concerns live here:
 *  1. A tolerant TOML parser/serializer used to *understand* an existing file
 *     (plan / already-configured / verify) and to render entries.
 *  2. A **surgical, comment-preserving section merge**: Codex config files are
 *     often heavily commented and owned by Codex itself, so CodeAtlas only
 *     inserts/replaces the managed `[rootKey.entryKey]` block and leaves every
 *     other byte of the file untouched (never clobber). An unparseable line is
 *     reported and blocks the change rather than risking a corrupt write.
 *
 * The supported subset covers the constructs found in real Codex `config.toml`
 * files: section headers with bare and quoted (basic/literal) segments,
 * `key = value` lines, literal and basic strings, integers, floats, booleans,
 * arrays, inline tables, and `#` comments.
 */

export interface TomlMergeResult {
  /** The merged TOML text (the managed block inserted/replaced, all other
   *  bytes preserved). */
  readonly text: string;
}

/**
 * Parse a TOML document into a nested object tree. Returns `fail` on any line
 * it cannot understand — callers treat that as "blocked, never clobber".
 */
export function parseTomlDocument(raw: string): Result<Record<string, unknown>> {
  const root: Record<string, unknown> = {};
  let context: Record<string, unknown> = root;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const arrayHeader = /^\[\[(.+)\]\]\s*(?:#.*)?$/.exec(trimmed);
    const tableHeader = /^\[(.+)\]\s*(?:#.*)?$/.exec(trimmed);
    if (arrayHeader !== null) {
      const path = parseTomlPath(arrayHeader[1] as string);
      if (path.length === 0) {
        return fail(new Error(`invalid TOML table header at line ${i + 1}`));
      }
      const created = navigate(root, path, true);
      if (created === null) {
        return fail(new Error(`cannot create array-of-tables at line ${i + 1}`));
      }
      context = created;
      continue;
    }
    if (tableHeader !== null) {
      const path = parseTomlPath(tableHeader[1] as string);
      if (path.length === 0) {
        return fail(new Error(`invalid TOML table header at line ${i + 1}`));
      }
      const created = navigate(root, path, false);
      if (created === null) {
        return fail(new Error(`cannot create table at line ${i + 1}`));
      }
      context = created;
      continue;
    }

    const equals = findUnquotedEquals(line);
    if (equals === -1) {
      return fail(new Error(`invalid TOML line at line ${i + 1}`));
    }
    const keyText = stripTomlComment(line.slice(0, equals)).trim();
    const valueText = stripTomlComment(line.slice(equals + 1)).trim();
    const keyPath = parseTomlPath(keyText);
    if (keyPath.length === 0) {
      return fail(new Error(`invalid TOML key at line ${i + 1}`));
    }
    const value = parseTomlValue(valueText);
    if (value instanceof Error) {
      return fail(new Error(`${value.message} at line ${i + 1}`));
    }
    if (!assignKey(context, keyPath, value)) {
      return fail(new Error(`cannot assign TOML key at line ${i + 1}`));
    }
  }
  return ok(root);
}

/** Serialize a nested object back into TOML (scalars first, then tables). */
export function serializeTomlDocument(document: Readonly<Record<string, unknown>>): string {
  const lines: string[] = [];
  const tables: [string, unknown][] = [];
  for (const [key, value] of Object.entries(document)) {
    if (isPlainObject(value) || isArrayOfTables(value)) {
      tables.push([key, value]);
    } else {
      lines.push(`${key} = ${renderTomlValue(value)}`);
    }
  }
  for (const [key, value] of tables) {
    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`[[${key}]]`);
        emitTable([key], item as Readonly<Record<string, unknown>>, lines);
      }
    } else if (isPlainObject(value)) {
      lines.push(`[${key}]`);
      emitTable([key], value, lines);
    }
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/**
 * Render the managed block for one tool: a `[rootKey.entryKey]` table with the
 * tool's entry keys, in Codex's `mcp_servers.<name>` shape.
 */
export function renderTomlEntryBlock(
  rootKey: string,
  entryKey: string,
  entry: Readonly<Record<string, unknown>>,
): string {
  const lines = [`[${rootKey}.${entryKey}]`];
  for (const [key, value] of Object.entries(entry)) {
    lines.push(`${key} = ${renderTomlValue(value)}`);
  }
  return lines.join("\n");
}

/**
 * Merge a tool's `[rootKey.entryKey]` block into an existing TOML document,
 * preserving every other line byte-for-byte (comments and formatting
 * included). Creates the section and the block when either is missing.
 */
export function mergeTomlSection(
  raw: string | null,
  rootKey: string,
  entryKey: string,
  entry: Readonly<Record<string, unknown>>,
): Result<TomlMergeResult> {
  const block = renderTomlEntryBlock(rootKey, entryKey, entry);
  if (raw === null || raw.trim() === "") {
    return ok({ text: `${block}\n` });
  }
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const headers = scanTomlHeaders(lines);
  const targetPath = [rootKey, entryKey];
  const targetHeader = headers.find(
    (header) => header.array === false && startsWith(header.path, targetPath),
  );

  if (targetHeader !== undefined) {
    let end = lines.length;
    const next = headers.find(
      (header) => header.index > targetHeader.index && !startsWith(header.path, targetPath),
    );
    if (next !== undefined) end = next.index;
    const merged = [
      ...lines.slice(0, targetHeader.index),
      ...block.split("\n"),
      ...lines.slice(end),
    ];
    return ok({ text: merged.join(eol) });
  }

  const rootHeaders = headers.filter(
    (header) => header.array === false && header.path[0] === rootKey,
  );
  if (rootHeaders.length > 0) {
    const rootTable = rootHeaders.find((header) => header.path.length === 1);
    let insertAt: number;
    if (rootTable !== undefined) {
      const nextHeader = headers.find((header) => header.index > rootTable.index);
      insertAt = nextHeader === undefined ? lines.length : nextHeader.index;
    } else {
      insertAt = rootHeaders[0]?.index ?? lines.length;
    }
    const merged = [...lines.slice(0, insertAt), ...block.split("\n"), ...lines.slice(insertAt)];
    return ok({ text: merged.join(eol) });
  }

  const text = raw.endsWith(eol) ? `${raw}${block}` : `${raw}${eol}${block}`;
  return ok({ text: `${text}${eol}` });
}

/** Render one TOML value (basic strings, numbers, booleans, arrays, inline
 *  tables). Strings are emitted as basic strings with JSON escapes — valid
 *  TOML basic-string escapes. */
export function renderTomlValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map(renderTomlValue).join(", ")}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => `${key} = ${renderTomlValue(item)}`)
      .join(", ");
    return `{ ${entries} }`;
  }
  return "''";
}

interface TomlHeader {
  readonly index: number;
  readonly path: readonly string[];
  readonly array: boolean;
}

function scanTomlHeaders(lines: readonly string[]): readonly TomlHeader[] {
  const headers: TomlHeader[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] as string).trim();
    const arrayHeader = /^\[\[(.+)\]\]\s*(?:#.*)?$/.exec(trimmed);
    const tableHeader = /^\[(.+)\]\s*(?:#.*)?$/.exec(trimmed);
    if (arrayHeader !== null) {
      const path = parseTomlPath(arrayHeader[1] as string);
      if (path.length > 0) headers.push({ index: i, path, array: true });
    } else if (tableHeader !== null) {
      const path = parseTomlPath(tableHeader[1] as string);
      if (path.length > 0) headers.push({ index: i, path, array: false });
    }
  }
  return headers;
}

/** Split a TOML header/key into path segments, honouring quoted segments. */
function parseTomlPath(inner: string): readonly string[] {
  const parts: string[] = [];
  let i = 0;
  const n = inner.length;
  while (i < n) {
    const ch = inner[i] as string;
    if (/\s/.test(ch) || ch === ".") {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = inner.indexOf(ch, i + 1);
      if (end === -1) return [];
      parts.push(inner.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < n && !/[.\s]/.test(inner[j] as string)) j += 1;
    parts.push(inner.slice(i, j));
    i = j;
  }
  return parts;
}

function navigate(
  root: Record<string, unknown>,
  path: readonly string[],
  array: boolean,
): Record<string, unknown> | null {
  let current: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i] as string;
    const existing = current[segment];
    if (Array.isArray(existing)) {
      const last = existing[existing.length - 1];
      if (!isPlainObject(last)) return null;
      current = last;
      continue;
    }
    if (existing === undefined) {
      const next: Record<string, unknown> = {};
      current[segment] = next;
      current = next;
      continue;
    }
    if (isPlainObject(existing)) {
      current = existing;
      continue;
    }
    return null;
  }
  const finalSegment = path[path.length - 1] as string;
  if (array) {
    const existing = current[finalSegment];
    if (Array.isArray(existing)) {
      const next: Record<string, unknown> = {};
      existing.push(next);
      return next;
    }
    if (existing === undefined) {
      const next: Record<string, unknown> = {};
      current[finalSegment] = [next];
      return next;
    }
    return null;
  }
  const existing = current[finalSegment];
  if (existing === undefined) {
    const next: Record<string, unknown> = {};
    current[finalSegment] = next;
    return next;
  }
  return isPlainObject(existing) ? existing : null;
}

function assignKey(
  context: Record<string, unknown>,
  keyPath: readonly string[],
  value: unknown,
): boolean {
  let current: Record<string, unknown> = context;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const segment = keyPath[i] as string;
    const existing = current[segment];
    if (existing === undefined) {
      const next: Record<string, unknown> = {};
      current[segment] = next;
      current = next;
      continue;
    }
    if (isPlainObject(existing)) {
      current = existing;
      continue;
    }
    return false;
  }
  current[keyPath[keyPath.length - 1] as string] = value;
  return true;
}

function parseTomlValue(text: string): unknown | Error {
  const t = text.trim();
  if (t.startsWith("[")) {
    const array = parseTomlArray(t);
    return array instanceof Error ? array : array;
  }
  if (t.startsWith("{")) {
    return parseTomlInlineTable(t);
  }
  if (t.startsWith("'")) {
    const end = t.indexOf("'", 1);
    if (end === -1) return new Error("unterminated literal string");
    return t.slice(1, end);
  }
  if (t.startsWith('"')) {
    const end = findBasicStringEnd(t);
    if (end === -1) return new Error("unterminated basic string");
    return decodeBasicString(t.slice(1, end));
  }
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^[+-]?\d+$/.test(t)) return Number(t);
  if (/^[+-]?\d+\.\d+([eE][+-]?\d+)?$/.test(t)) return Number(t);
  // Dates, bare words, and anything else are kept as strings (never guessed).
  return t;
}

function parseTomlArray(text: string): unknown | Error {
  const end = findMatching(text, "[", "]", 0);
  if (end === -1 || end !== text.length - 1) {
    return new Error("invalid TOML array");
  }
  const inner = text.slice(1, end).trim();
  if (inner === "") return [];
  const parts = splitTopLevel(inner, ",");
  const out: unknown[] = [];
  for (const part of parts) {
    const value = parseTomlValue(part);
    if (value instanceof Error) return value;
    out.push(value);
  }
  return out;
}

function parseTomlInlineTable(text: string): unknown | Error {
  const end = findMatching(text, "{", "}", 0);
  if (end === -1 || end !== text.length - 1) {
    return new Error("invalid TOML inline table");
  }
  const inner = text.slice(1, end).trim();
  const object: Record<string, unknown> = {};
  if (inner === "") return object;
  for (const part of splitTopLevel(inner, ",")) {
    const equals = findUnquotedEquals(part);
    if (equals === -1) return new Error("invalid TOML inline table entry");
    const key = part.slice(0, equals).trim();
    const value = parseTomlValue(part.slice(equals + 1));
    if (value instanceof Error) return value;
    object[key] = value;
  }
  return object;
}

/** Split on a separator at nesting depth zero, outside strings. */
function splitTopLevel(text: string, separator: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
      current += ch;
      continue;
    }
    if (ch === '"' && !inLiteral) {
      inBasic = !inBasic;
      current += ch;
      continue;
    }
    if (!inBasic && !inLiteral) {
      if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") depth -= 1;
    }
    if (ch === separator && depth === 0 && !inBasic && !inLiteral) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

/** Find the index of the matching closing bracket, or -1. */
function findMatching(text: string, open: string, close: string, start: number): number {
  let depth = 0;
  let inBasic = false;
  let inLiteral = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
      continue;
    }
    if (ch === '"' && !inLiteral) {
      inBasic = !inBasic;
      continue;
    }
    if (!inBasic && !inLiteral) {
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function findBasicStringEnd(text: string): number {
  for (let i = 1; i < text.length; i++) {
    if ((text[i] as string) === "\\") {
      i += 1;
      continue;
    }
    if ((text[i] as string) === '"') return i;
  }
  return -1;
}

function decodeBasicString(value: string): string {
  return value.replace(/\\(u[0-9A-Fa-f]{4}|.)/g, (_match, esc: string) => {
    if (esc === "n") return "\n";
    if (esc === "t") return "\t";
    if (esc === "r") return "\r";
    if (esc === "b") return "\b";
    if (esc === "f") return "\f";
    if (esc.startsWith("u")) return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    return esc;
  });
}

function findUnquotedEquals(line: string): number {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
      continue;
    }
    if (ch === '"' && !inLiteral) {
      inBasic = !inBasic;
      continue;
    }
    if (ch === "=" && !inBasic && !inLiteral) return i;
  }
  return -1;
}

function stripTomlComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
      continue;
    }
    if (ch === '"' && !inLiteral) {
      inBasic = !inBasic;
      continue;
    }
    if (ch === "#" && !inBasic && !inLiteral) return line.slice(0, i);
  }
  return line;
}

function emitTable(
  path: readonly string[],
  value: Readonly<Record<string, unknown>>,
  lines: string[],
): void {
  const scalars: [string, unknown][] = [];
  const children: [string, unknown][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (isPlainObject(item) || isArrayOfTables(item)) {
      children.push([key, item]);
    } else {
      scalars.push([key, item]);
    }
  }
  for (const [key, item] of scalars) {
    lines.push(`${key} = ${renderTomlValue(item)}`);
  }
  for (const [key, item] of children) {
    if (Array.isArray(item)) {
      for (const element of item) {
        lines.push(`[[${[...path, key].join(".")}]]`);
        emitTable([...path, key], element, lines);
      }
    } else if (isPlainObject(item)) {
      lines.push(`[${[...path, key].join(".")}]`);
      emitTable([...path, key], item, lines);
    }
  }
}

function startsWith(path: readonly string[], prefix: readonly string[]): boolean {
  return path.length >= prefix.length && prefix.every((part, i) => path[i] === part);
}

function isArrayOfTables(value: unknown): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isPlainObject(item));
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
