#!/usr/bin/env node
/**
 * Deterministic generator for the CodeAtlas extreme stress-benchmark
 * repositories (benchmarks/extreme).
 *
 * Produces valid TypeScript source with realistic monorepo structure,
 * cross-file imports, per-file symbol variation, duplicated names across
 * packages, dense generated data, tests, docs, config and ignored
 * directories. Fully seeded/deterministic for reproducibility.
 *
 * Usage:
 *   node benchmarks/extreme/generate.mjs --repo a             # 5000 x 5000-line files
 *   node benchmarks/extreme/generate.mjs --repo b             # 10000 x 15000-line files
 *   node benchmarks/extreme/generate.mjs --repo a --count 20 --lines 5000 --out /tmp/cal
 *   node benchmarks/extreme/generate.mjs --verify --repo a
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTREME_ROOT = HERE;

const args = process.argv.slice(2);
const argValue = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const REPO = argValue("--repo") ?? "a";
const OVERRIDE_COUNT = argValue("--count");
const OVERRIDE_LINES = argValue("--lines");
const OVERRIDE_SCALE = Number(argValue("--scale") ?? "1");
const OUT_DIR = argValue("--out") ?? path.join(EXTREME_ROOT, REPO === "a" ? "repo-5000" : "repo-10000");
const VERIFY_ONLY = args.includes("--verify");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cap = (s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));
const pascalize = (stem) =>
  stem.split(/[-_]+/).filter(Boolean).map(cap).join("");

const DOMAIN_WORDS = [
  "auth", "users", "payments", "billing", "notifications", "database", "search",
  "analytics", "shared", "validation", "cache", "events", "storage", "flags",
  "metrics", "logging", "config", "network", "security", "gateway",
];

const METHOD_VERBS = [
  "get", "set", "create", "update", "delete", "find", "fetch", "validate",
  "compute", "render", "build", "parse", "serialize", "emit", "handle",
  "register", "lookup", "transform", "merge", "split", "read", "write", "load",
  "save", "apply", "check", "verify", "resolve", "dispatch", "observe",
];

const METHOD_NOUNS = [
  "record", "entry", "payload", "session", "token", "user", "account", "order",
  "invoice", "refund", "customer", "cart", "config", "metric", "event", "message",
  "queue", "job", "cache", "index", "row", "batch", "buffer", "stream", "policy",
  "rule", "matcher", "handler", "factory", "registry",
];

const BODY_TEMPLATES = [
  "const result = this.store.lookup(%S%) ?? this.defaults[key];\n      return result;",
  "if (!value) {\n        throw new Error(%S%);\n      }\n      return value;",
  "const count = await this.repository.count(filter);\n      return count > threshold;",
  "const mapped = this.mapper.transform(entry, context);\n      return mapped;",
  "this.cache.set(key, value, ttl);\n      return this.cache.get(key);",
  "const [head, ...rest] = input;\n      return head ?? rest.join(%S%);",
  "const normalized = String(raw).trim().toLowerCase();\n      return normalized;",
  "for (const item of batch) {\n        this.emitter.emit(%S%, item);\n      }\n      return batch.length;",
  "const parsed = JSON.parse(String(payload)) as Record<string, unknown>;\n      return parsed;",
  "const total = items.reduce((sum, item) => sum + (Number(item) || 0), 0);\n      return total;",
  "const window = buffer.slice(start, end);\n      return this.codec.decode(window);",
  "if (retries >= maxRetries) {\n        throw new Error(%S%);\n      }\n      return this.attempt(++retries);",
  "const id = await this.idGen.next(scope);\n      return this.stamp(id);",
  "const policy = this.policies.match(kind, flags);\n      return policy?.allow ?? true;",
  "const now = Date.now();\n      const expiresAt = now + ttl;\n      this.entries.set(key, { value, expiresAt });\n      return value;",
  "const keyed = new Map<string, number>();\n      for (const item of list) {\n        keyed.set(item.id, item.score);\n      }\n      return keyed;",
];

const DENSE_HEADERS = [
  "lookup", "index", "registry", "catalog", "inventory", "schema", "mapping",
  "manifest", "route", "constraint", "dimension", "report", "fixture", "matrix",
];

const ERROR_CODES = [
  "ERR_INVALID_ARG", "ERR_NOT_FOUND", "ERR_TIMEOUT", "ERR_UNAUTHORIZED",
  "ERR_FORBIDDEN", "ERR_VALIDATION", "ERR_CONFLICT", "ERR_RATE_LIMIT",
];

const PACKAGES_A = ["auth", "users", "payments", "billing", "notifications", "database", "search", "analytics", "shared", "ui"];
const APPS_A = ["web", "admin", "api", "worker"];
const SERVICES_A = ["authentication", "payments", "users", "notifications"];

const PACKAGES_B = [
  "auth", "users", "payments", "billing", "notifications", "database", "search",
  "analytics", "shared", "ui", "validation", "cache", "events", "storage", "feature-flags",
];
const APPS_B = ["web", "admin", "api", "worker", "mobile", "desktop", "cli"];
const SERVICES_B = ["authentication", "payments", "users", "notifications", "billing", "search"];
const LIBRARIES_B = ["core-utils", "http-client", "logging", "config"];
const WORKERS_B = ["queue-worker", "report-worker", "cleanup-worker"];
const PLUGINS_B = ["auth-plugin", "storage-plugin", "metrics-plugin"];
const TOOLS_B = ["build-tools", "migration-tools"];
const MODULE_DOMAINS = [
  "tenant", "org", "billing", "crm", "catalog", "inventory", "shipping",
  "fulfillment", "support", "audit", "compliance", "payroll", "tax", "pricing",
  "quotas", "workflow", "etl", "realtime", "telemetry", "gateway",
];

const STEM_POOLS = {
  auth: ["authenticator", "session", "credential", "token", "scope", "permission", "mfa", "password", "policy", "principal", "realm", "challenge"],
  users: ["user", "profile", "account", "contact", "address", "preference", "role", "membership", "invite", "audit-log"],
  payments: ["validator", "amount", "currency", "ledger", "gateway", "refund", "invoice", "customer", "charge", "payout", "balance", "fee", "tax", "discount", "voucher", "receipt", "settlement", "card", "wallet", "bank"],
  billing: ["plan", "subscription", "cycle", "invoice-line", "dunning", "pricing-tier", "metering", "usage", "coupon", "statement"],
  notifications: ["channel", "template", "delivery", "subscription", "digest", "preference", "webhook", "push", "email", "sms"],
  database: ["connection", "pool", "migration", "schema", "query", "index", "transaction", "repository", "table", "constraint"],
  search: ["query", "indexer", "ranker", "tokenizer", "analyzer", "filter", "facet", "suggestion", "synonym", "shard"],
  analytics: ["event", "pipeline", "aggregation", "dashboard", "metric", "dimension", "cohort", "funnel", "retention", "attribution"],
  shared: ["util", "type", "guard", "result", "error", "config", "env", "logger", "constants", "helper"],
  ui: ["button", "input", "table", "form", "modal", "toast", "badge", "card", "tabs", "menu"],
  validation: ["rule", "schema", "constraint", "checker", "parser", "normalizer", "coercer", "predicate", "composite", "fallback"],
  cache: ["store", "policy", "stampede", "cooldown", "tier", "shard", "serializer", "loader", "invalidator", "metrics"],
  events: ["bus", "outbox", "handler", "producer", "consumer", "envelope", "header", "dead-letter", "retry", "saga"],
  storage: ["blob", "object", "bucket", "archive", "backup", "restore", "lease", "lock", "snapshot", "chunk"],
  "feature-flags": ["flag", "evaluator", "override", "rollout", "segment", "target", "experiment", "audience", "kill-switch", "variant"],
  web: ["page", "layout", "view", "controller", "route", "middleware", "component", "hook", "state", "api-client"],
  admin: ["dashboard", "panel", "table", "filter", "chart", "form", "settings", "audit", "export", "import"],
  api: ["route", "controller", "middleware", "handler", "serializer", "validator", "gateway", "resolver", "endpoint", "dto"],
  worker: ["job", "queue", "worker", "scheduler", "cron", "retry", "dead-letter", "batch", "processor", "pool"],
  authentication: ["login", "logout", "refresh", "verify", "reset", "register", "session", "password", "factor", "provider"],
  mobile: ["screen", "navigation", "store", "notification", "sync", "offline", "deep-link", "auth", "settings", "profile"],
  desktop: ["window", "panel", "settings", "updater", "shortcut", "workspace", "theme", "plugin-host", "menu", "status"],
  cli: ["command", "flag", "prompt", "output", "config", "update", "help", "plugin", "render", "interactive"],
  "core-utils": ["string", "array", "object", "number", "date", "async", "hash", "base64", "json", "matcher"],
  "http-client": ["request", "response", "retry", "auth", "redirect", "timeout", "cache", "interceptor", "stream", "cookie"],
  logging: ["level", "sink", "formatter", "buffer", "sampler", "correlation", "redactor", "rotation", "source", "field"],
  config: ["loader", "resolver", "override", "validator", "watcher", "defaults", "secrets", "profile", "schema", "provider"],
  "queue-worker": ["poll", "ack", "nack", "lease", "heartbeat", "concurrency", "backoff", "poison", "prefetch", "shutdown"],
  "report-worker": ["report", "aggregate", "render", "deliver", "schedule", "archive", "export", "pipeline", "chart", "snapshot"],
  "cleanup-worker": ["expire", "purge", "vacuum", "archive", "tombstone", "retention", "garbage", "rotate", "reclaim", "index"],
  "auth-plugin": ["registry", "provider", "oidc", "saml", "ldap", "jwt", "session", "consent", "key", "cert"],
  "storage-plugin": ["adapter", "mount", "bucket", "encryption", "checksum", "replica", "quota", "acl", "endpoint", "compression"],
  "metrics-plugin": ["collector", "exporter", "label", "histogram", "counter", "gauge", "summary", "alert", "threshold", "sampler"],
  "build-tools": ["bundle", "minify", "tree-shake", "manifest", "fingerprint", "cache", "watch", "proxy", "env", "target"],
  "migration-tools": ["plan", "apply", "rollback", "baseline", "checksum", "order", "lock", "dry-run", "up", "down"],
  integration: ["workflow", "scenario", "pipeline", "flow", "journey", "contract", "compliance", "stress", "recovery", "smoke"],
};

const DEFAULT_POOL = ["component", "helper", "adapter", "facade", "proxy", "decorator", "strategy", "pipeline", "registry", "coordinator", "orchestrator", "assembler", "bootstrap", "provisioner", "scheduler", "dispatcher"];

function poolFor(dir) {
  for (const key of Object.keys(STEM_POOLS)) {
    if (dir.includes(`/${key}`) || dir.startsWith(key)) return STEM_POOLS[key];
  }
  return DEFAULT_POOL;
}

function buildManifest({ filesPerArea, deepModules, scale }) {
  const records = [];
  const byDir = new Map();
  const add = (dir, stem, kind) => {
    const rel = `${dir}/${stem}.ts`;
    records.push({ rel, stem, dir, kind });
    let list = byDir.get(dir);
    if (list === undefined) {
      list = [];
      byDir.set(dir, list);
    }
    list.push({ rel, stem });
  };
  const fillArea = (dir, count, kind) => {
    const pool = poolFor(dir);
    for (let i = 0; i < count; i += 1) {
      const stem = `${pool[i % pool.length]}-${String(i).padStart(4, "0")}`;
      add(dir, stem, kind);
    }
  };
  for (const area of filesPerArea) {
    const { dir, count, kind } = area;
    const scaledCount = Math.max(1, Math.floor(count / scale));
    if (kind === "modules") {
      const perModule = Math.ceil(scaledCount / deepModules.length);
      let emitted = 0;
      for (let m = 0; m < deepModules.length && emitted < scaledCount; m += 1) {
        const modDir = `modules/${deepModules[m]}/src`;
        const featCount = Math.min(perModule, scaledCount - emitted);
        for (let f = 0; f < featCount; f += 1) {
          const featDir = `${modDir}/features/feature-${String(f).padStart(2, "0")}/domain/services`;
          const pool = poolFor(`modules/${deepModules[m]}`);
          const stem = `${pool[(f + m) % pool.length]}-${String(emitted).padStart(4, "0")}`;
          add(featDir, stem, "src");
          emitted += 1;
        }
      }
    } else if (kind === "integration") {
      const pool = STEM_POOLS.integration;
      for (let i = 0; i < scaledCount; i += 1) {
        const stem = `${pool[i % pool.length]}-${String(i).padStart(4, "0")}`;
        add("tests/integration", stem, "test");
      }
    } else {
      fillArea(dir, scaledCount, kind);
    }
  }
  return { records, byDir };
}

function canonicalNames(stem) {
  const p = pascalize(stem);
  return {
    cls: `${p}Service`,
    iface: `${p}Config`,
    fn: `create${p}`,
    versionConst: `${p.toUpperCase()}_VERSION`,
    repo: `${p}Repository`,
    entity: `${p}Entity`,
  };
}

function relativeImportPath(fromDir, toRel) {
  const fromParts = fromDir.split("/");
  const toParts = toRel.split("/");
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const up = fromParts.length - common;
  const down = toParts.slice(common);
  const segments = [];
  for (let i = 0; i < up; i += 1) segments.push("..");
  segments.push(...down);
  let rel = segments.join("/");
  rel = rel.replace(/\.ts$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function renderTsFile({ rec, ctx, targetLines, rng }) {
  const { stem, dir, kind } = rec;
  const names = canonicalNames(stem);
  const moduleTag = dir.split("/").slice(0, -1).join(".") || "root";
  const lines = [];
  const methodCount = Math.min(140, Math.max(20, Math.floor(targetLines / 50)));

  lines.push("/**");
  lines.push(` * ${moduleTag}.${stem} - ${kind === "test" ? "unit/integration tests for " : "implementation of "}${names.cls}.`);
  lines.push(" *");
  lines.push(" * Responsible for deterministic, fault-tolerant handling of the");
  lines.push(` * ${stem.split("-").join(" ")} domain surface within the ${moduleTag} boundary.`);
  lines.push(" * @module " + moduleTag);
  lines.push(" * @since 1.0.0");
  lines.push(" */");

  const imported = [];
  const seenNames = new Set([names.cls, names.iface, names.fn, names.versionConst, names.repo, names.entity]);
  const pool = ctx.siblingTargets;
  const pick = [];
  if (pool.length >= 2) {
    const a = pool[Math.floor(rng() * pool.length)];
    let b = pool[Math.floor(rng() * pool.length)];
    if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
    pick.push(a, b);
  }
  if (ctx.crossTarget !== null) pick.push(ctx.crossTarget);
  for (const t of pick) {
    if (t.rel === rec.rel) continue;
    const tn = canonicalNames(t.stem);
    const relPath = relativeImportPath(dir, t.rel);
    const bindings = [];
    for (const c of [tn.cls, tn.iface, tn.versionConst]) {
      if (!seenNames.has(c)) {
        bindings.push(c);
        seenNames.add(c);
        imported.push({ name: c, relPath });
        if (bindings.length >= 2) break;
      }
    }
    if (bindings.length > 0) {
      lines.push(`import { ${bindings.join(", ")} } from "${relPath}";`);
    }
  }

  lines.push("");
  lines.push(`export interface ${names.iface} {`);
  lines.push("  readonly enabled: boolean;");
  lines.push("  readonly mode: string;");
  lines.push("  readonly timeoutMs: number;");
  lines.push("  readonly retries: number;");
  lines.push("}");
  lines.push("");
  lines.push(`export const ${names.versionConst} = "1.0.0";`);
  lines.push("");
  lines.push(`export function ${names.fn}(options: Partial<${names.iface}> = {}): ${names.cls} {`);
  lines.push(`  return new ${names.cls}(options);`);
  lines.push("}");
  lines.push("");
  lines.push(`export interface ${names.entity} {`);
  lines.push("  readonly id: string;");
  lines.push("  readonly name: string;");
  lines.push("  readonly kind: string;");
  lines.push("  readonly tags: readonly string[];");
  lines.push("}");
  lines.push("");

  lines.push(`export class ${names.cls} {`);
  lines.push("  private readonly store: Map<string, unknown> = new Map();");
  lines.push("  private readonly defaults: Partial<" + names.iface + "> = {};");
  lines.push("");
  lines.push(`  public constructor(private readonly options: Partial<${names.iface}> = {}) {`);
  lines.push("    this.defaults = options;");
  lines.push("  }");
  lines.push("");
  let refBody = false;
  for (let m = 0; m < methodCount; m += 1) {
    const verb = METHOD_VERBS[(m * 7) % METHOD_VERBS.length];
    const noun = METHOD_NOUNS[(m * 13) % METHOD_NOUNS.length];
    const methodName = `${verb}${cap(noun)}${String(m).padStart(3, "0")}`;
    const paramType = m % 3 === 0 ? "string" : m % 3 === 1 ? "number" : `${names.entity}[]`;
    lines.push("");
    lines.push("  /**");
    lines.push(`   * ${cap(verb)} the ${noun} for index ${m} deterministically.`);
    lines.push(`   * @param input the ${noun} input of type ${paramType}`);
    lines.push("   * @returns the computed result");
    lines.push("   */");
    lines.push(`  public ${methodName}(input: ${paramType}, key?: string): unknown {`);
    if (m % 4 === 0) {
      if (imported.length > 0 && !refBody) {
        const imp = imported[m % imported.length];
        lines.push(`    const peer = new ${imp.name}();`);
        lines.push("    peer.touch?.();");
        lines.push("    return peer;");
        refBody = true;
      } else {
        lines.push("    const token = this.cacheKey(input, key);");
        lines.push("    return this.store.get(token);");
      }
    } else {
      const tmpl = BODY_TEMPLATES[m % BODY_TEMPLATES.length];
      const literal = `"${moduleTag}.${stem}.m${m}"`;
      lines.push(...tmpl.replace(/%S%/g, literal).split("\n").map((l) => "    " + l));
    }
    lines.push("  }");
  }
  lines.push("");
  lines.push("  private cacheKey(input: unknown, key?: string): string {");
  lines.push('    return `${typeof input}:${key ?? "default"}`;');
  lines.push("  }");
  lines.push("}");
  lines.push("");

  lines.push(`export class ${names.repo} {`);
  lines.push(`  private readonly rows: ${names.entity}[] = [];`);
  lines.push("");
  for (let r = 0; r < 8; r += 1) {
    lines.push(`  public find${cap(METHOD_NOUNS[(r * 5) % METHOD_NOUNS.length])}${r}(id: string): Promise<${names.entity} | undefined> {`);
    lines.push("    return Promise.resolve(this.rows.find((row) => row.id === id));");
    lines.push("  }");
  }
  lines.push("}");
  lines.push("");
  for (let s = 0; s < 6; s += 1) {
    const fnName = `${METHOD_VERBS[(s * 3) % METHOD_VERBS.length]}${cap(DOMAIN_WORDS[(s * 11) % DOMAIN_WORDS.length])}${s}`;
    lines.push(`export function ${fnName}(input: string): string {`);
    lines.push("  const normalized = input.trim().toLowerCase();");
    lines.push(`  return normalized === "" ? "${ERROR_CODES[s % ERROR_CODES.length]}" : normalized;`);
    lines.push("}");
    lines.push("");
  }

  const headerWord = DENSE_HEADERS[hash32(stem) % DENSE_HEADERS.length];
  const dataVar = `${pascalize(headerWord)}Data`;
  let arrayIdx = 0;
  while (lines.length < targetLines - 50) {
    const varName = arrayIdx === 0 ? dataVar : `${dataVar}_${arrayIdx}`;
    lines.push(`export const ${varName}: ReadonlyArray<readonly [string, string, number, string, string]> = [`);
    const remaining = targetLines - 50 - (lines.length + 2);
    const count = Math.min(Math.max(200, Math.floor(remaining)), 16000);
    const gBase = hash32(stem);
    const gStep = gBase % 5;
    for (let i = 0; i < count; i += 1) {
      const g = DOMAIN_WORDS[(i + gBase) % DOMAIN_WORDS.length];
      const t1 = DOMAIN_WORDS[(i * 3 + gBase) % DOMAIN_WORDS.length];
      const t2 = DOMAIN_WORDS[(i * 7 + gBase + gStep) % DOMAIN_WORDS.length];
      const key = `${g}_${stem}_k${String(i).padStart(6, "0")}`;
      const weight = ((i * 2654435761) >>> 0) % 1000;
      lines.push(`  ["${key}", "${g}", ${weight}, "${t1}", "${t2}"],`);
    }
    lines.push("];");
    lines.push("");
    arrayIdx += 1;
  }

  while (lines.length < targetLines) {
    lines.push(`// padding-${lines.length}`);
  }

  return lines.join("\n") + "\n";
}

function renderTestFile({ rec, ctx, targetLines, rng }) {
  const { stem, dir } = rec;
  const names = canonicalNames(stem);
  const moduleTag = dir.split("/").slice(0, -1).join(".") || "root";
  const src = ctx.srcTargets.length > 0 ? ctx.srcTargets[hash32(stem) % ctx.srcTargets.length] : null;
  const srcNames = src !== null ? canonicalNames(src.stem) : names;
  const lines = [];
  lines.push("/**");
  lines.push(` * Test suite for ${moduleTag}.${stem}.`);
  lines.push(" * Exercises the deterministic contract surface under stress.");
  lines.push(" */");
  lines.push(`import { describe, it, expect, beforeEach } from "@atlas/test-utils";`);
  if (src !== null && src.rel !== rec.rel) {
    const relPath = relativeImportPath(dir, src.rel);
    lines.push(`import { ${srcNames.cls} } from "${relPath}";`);
  }
  lines.push("");
  lines.push(`describe("${moduleTag}.${stem}", () => {`);
  lines.push("  beforeEach(() => {");
  lines.push("    expect.resetMock?.();");
  lines.push("  });");
  lines.push("");
  const itCount = 200;
  for (let t = 0; t < itCount; t += 1) {
    const verb = METHOD_VERBS[t % METHOD_VERBS.length];
    const noun = METHOD_NOUNS[(t * 3) % METHOD_NOUNS.length];
    lines.push(`  it("${stem} case ${t} - ${verb} ${noun}", () => {`);
    lines.push(`    const subject = new ${srcNames.cls}({ enabled: true, retries: ${t % 4} });`);
    lines.push(`    const result = subject.${verb}${cap(noun)}${String(t).padStart(3, "0")}("${moduleTag}.${stem}", "key");`);
    lines.push("    expect(result).toBeDefined();");
    lines.push("  });");
  }
  let arrayIdx = 0;
  while (lines.length < targetLines - 20) {
    lines.push(`  const fixture_${arrayIdx}: ReadonlyArray<readonly [string, number]> = [`);
    const remaining = targetLines - 20 - (lines.length + 2);
    const count = Math.min(Math.max(100, Math.floor(remaining)), 16000);
    for (let i = 0; i < count; i += 1) {
      lines.push(`    ["fixture-${arrayIdx}-${String(i).padStart(6, "0")}", ${((i * 7) >>> 0) % 100}],`);
    }
    lines.push("  ];");
    arrayIdx += 1;
  }
  lines.push("});");
  while (lines.length < targetLines) {
    lines.push(`// padding-${lines.length}`);
  }
  return lines.join("\n") + "\n";
}

const DOC_TEMPLATE_PARAS = [
  "This document describes the operational contract, failure semantics, and integration surface of the {AREA} component within the CodeAtlas extreme repository.",
  "Requests must be authenticated with a scoped bearer token issued by the {AREA} service; anonymous access is denied by default.",
  "The {AREA} boundary guarantees at-least-once delivery for state transitions and exposes idempotency keys for retries.",
  "Configuration is loaded from environment variables and validated against the schema published in the config directory.",
  "Metrics emitted by {AREA} are labeled with region, shard, and tenant so that operators can slice alerts per dimension.",
  "All writes flow through the outbox pattern; consumers must tolerate duplicate events and apply deterministic reconciliation.",
  "Rollouts are gated behind feature flags; the kill switch bypasses the {AREA} pipeline without a redeploy.",
  "Observability spans carry correlation ids propagated from the API gateway through the queue and into the database layer.",
  "Backup and restore procedures are covered in the runbooks; recovery time objectives are defined per data class.",
  "Deprecated endpoints remain available for one year and emit soft-deprecation headers before removal.",
  "The {AREA} team owns the contract for this module; breaking changes require a major version bump and a migration plan.",
  "Local development uses the deterministic fixture generator; production data must never be committed to the repository.",
];

function renderDoc(area, idx) {
  const lines = [];
  lines.push(`# ${area} - Operational Reference ${idx}`);
  lines.push("");
  lines.push("Status: **active** | Owner: **CodeAtlas benchmark** | Version: 1.0.0");
  lines.push("");
  for (let p = 0; p < 40; p += 1) {
    lines.push(DOC_TEMPLATE_PARAS[p % DOC_TEMPLATE_PARAS.length].replaceAll("{AREA}", area));
    lines.push("");
  }
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Key | Type | Default |");
  lines.push("| --- | --- | --- |");
  for (let i = 0; i < 24; i += 1) {
    lines.push(`| ${area.toUpperCase()}_${DOMAIN_WORDS[i % DOMAIN_WORDS.length].toUpperCase()} | string | "${ERROR_CODES[i % ERROR_CODES.length]}" |`);
  }
  lines.push("");
  lines.push("## Index");
  lines.push("");
  for (let i = 0; i < 30; i += 1) {
    lines.push(`- ${area}/${DOMAIN_WORDS[i % DOMAIN_WORDS.length]}-${String(i).padStart(3, "0")}`);
  }
  return lines.join("\n") + "\n";
}

function renderConfig(area, idx) {
  const lines = [];
  lines.push("# generated by benchmark generator");
  lines.push(`area: ${area}`);
  lines.push(`index: ${idx}`);
  lines.push("enabled: true");
  lines.push(`timeoutMs: ${1000 + ((idx * 97) % 9000)}`);
  lines.push(`retries: ${idx % 5}`);
  for (let i = 0; i < 120; i += 1) {
    lines.push(`${DOMAIN_WORDS[i % DOMAIN_WORDS.length]}.weight: ${(idx * 31 + i) % 100}`);
  }
  return lines.join("\n") + "\n";
}

const REPO_SPECS = {
  a: {
    outName: "repo-5000",
    fileCount: OVERRIDE_COUNT ? Number(OVERRIDE_COUNT) : 5000,
    targetLines: OVERRIDE_LINES ? Number(OVERRIDE_LINES) : 5000,
    seed: 0x5eed0001,
    filesPerArea: [
      ...PACKAGES_A.flatMap((p) => [
        { dir: `packages/${p}/src`, count: 180, kind: "src" },
        { dir: `packages/${p}/tests`, count: 140, kind: "test" },
      ]),
      ...APPS_A.flatMap((a) => [
        { dir: `apps/${a}/src`, count: 130, kind: "src" },
        { dir: `apps/${a}/tests`, count: 60, kind: "test" },
      ]),
      ...SERVICES_A.flatMap((s) => [
        { dir: `services/${s}/src`, count: 100, kind: "src" },
        { dir: `services/${s}/tests`, count: 60, kind: "test" },
      ]),
      { dir: "tests/integration", count: 400, kind: "integration" },
    ],
    docsCount: 60,
    configCount: 40,
    readmeCount: 16,
    monsterFiles: 0,
    ignoredFiles: 12,
  },
  b: {
    outName: "repo-10000",
    fileCount: OVERRIDE_COUNT ? Number(OVERRIDE_COUNT) : 10000,
    targetLines: OVERRIDE_LINES ? Number(OVERRIDE_LINES) : 15000,
    seed: 0x5eed0002,
    filesPerArea: [
      ...APPS_B.flatMap((a) => [
        { dir: `apps/${a}/src`, count: 150, kind: "src" },
        { dir: `apps/${a}/tests`, count: 100, kind: "test" },
      ]),
      ...PACKAGES_B.flatMap((p) => [
        { dir: `packages/${p}/src`, count: 150, kind: "src" },
        { dir: `packages/${p}/tests`, count: 100, kind: "test" },
      ]),
      ...SERVICES_B.flatMap((s) => [
        { dir: `services/${s}/src`, count: 110, kind: "src" },
        { dir: `services/${s}/tests`, count: 90, kind: "test" },
      ]),
      ...LIBRARIES_B.flatMap((l) => [
        { dir: `libraries/${l}/src`, count: 110, kind: "src" },
        { dir: `libraries/${l}/tests`, count: 90, kind: "test" },
      ]),
      ...WORKERS_B.flatMap((w) => [
        { dir: `workers/${w}/src`, count: 40, kind: "src" },
        { dir: `workers/${w}/tests`, count: 10, kind: "test" },
      ]),
      ...PLUGINS_B.flatMap((p) => [
        { dir: `plugins/${p}/src`, count: 40, kind: "src" },
        { dir: `plugins/${p}/tests`, count: 10, kind: "test" },
      ]),
      ...TOOLS_B.flatMap((t) => [
        { dir: `tools/${t}/src`, count: 40, kind: "src" },
        { dir: `tools/${t}/tests`, count: 10, kind: "test" },
      ]),
      { dir: "modules", count: 2000, kind: "modules" },
      { dir: "tests/integration", count: 100, kind: "integration" },
    ],
    docsCount: 100,
    configCount: 60,
    readmeCount: 25,
    monsterFiles: 5,
    ignoredFiles: 40,
  },
};

function writeExtremeGitignore() {
  // Prevents the generated benchmark repositories (multi-GB) from ever being
  // staged into the CodeAtlas git repository. Lives OUTSIDE the benchmark
  // repos so the CodeAtlas scanner never sees it.
  const content = [
    "# Generated benchmark repositories (multi-GB, deterministic). Never commit.",
    "repo-5000/",
    "repo-10000/",
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(EXTREME_ROOT, ".gitignore"), content);
}

function ensureDir(root, rel) {
  const full = path.join(root, rel);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

function generateRepo(spec) {
  const root = OUT_DIR;
  const t0 = Date.now();
  fs.mkdirSync(root, { recursive: true });
  const manifest = buildManifest({ filesPerArea: spec.filesPerArea, deepModules: MODULE_DOMAINS, scale: OVERRIDE_SCALE });
  const { records } = manifest;

  const srcDirs = new Set();
  const sharedUtil = "packages/shared/src/util-0000.ts";
  const authUtil = "packages/auth/src/authenticator-0000.ts";
  for (const r of records) {
    if (r.kind === "src") srcDirs.add(r.dir);
    const sib = manifest.byDir.get(r.dir) ?? [];
    const crossTarget =
      r.dir.startsWith("packages/shared/") || r.dir.startsWith("libraries/config/")
        ? authUtil
        : sharedUtil;
    const cross = manifest.byDir.get(path.posix.dirname(crossTarget))?.find(
      (x) => x.rel === crossTarget,
    ) ?? null;
    const parentSrc = r.dir.replace(/\/tests$/, "/src");
    const srcTargets = parentSrc !== r.dir ? (manifest.byDir.get(parentSrc) ?? []) : [];
    const ctx = {
      siblingTargets: sib.filter((x) => x.rel !== r.rel),
      crossTarget: cross,
      srcTargets,
    };
    const rng = mulberry32((hash32(r.rel) ^ spec.seed) >>> 0);
    const content = r.kind === "test" || r.kind === "integration"
      ? renderTestFile({ rec: r, ctx, targetLines: spec.targetLines, rng })
      : renderTsFile({ rec: r, ctx, targetLines: spec.targetLines, rng });
    const full = ensureDir(root, path.posix.dirname(r.rel));
    fs.writeFileSync(path.join(full, path.posix.basename(r.rel)), content);
  }

  // Monster files beyond maxReferenceLines (20k) to exercise the reference cap.
  for (let m = 0; m < spec.monsterFiles; m += 1) {
    const rel = `apps/cli/generated/bundle-${String(m).padStart(4, "0")}.generated.ts`;
    const rng = mulberry32((hash32(rel) ^ spec.seed) >>> 0);
    const content = renderTsFile({
      rec: { rel, stem: `bundle-${m}`, dir: "apps/cli/generated", kind: "src" },
      ctx: { siblingTargets: [], crossTarget: null, srcTargets: [] },
      targetLines: 25000,
      rng,
    });
    const full = ensureDir(root, "apps/cli/generated");
    fs.writeFileSync(path.join(full, `bundle-${String(m).padStart(4, "0")}.generated.ts`), content);
  }

  // Docs (markdown).
  const docAreas = [...new Set(records.map((r) => r.dir.split("/")[0]))];
  for (let d = 0; d < spec.docsCount; d += 1) {
    const area = docAreas[d % docAreas.length];
    const full = ensureDir(root, `docs/${area}`);
    fs.writeFileSync(path.join(full, `${area}-guide-${String(d).padStart(3, "0")}.md`), renderDoc(area, d));
  }

  // Config files (yaml/env/json).
  for (let c = 0; c < spec.configCount; c += 1) {
    const area = docAreas[c % docAreas.length];
    const full = ensureDir(root, `config/${area}`);
    fs.writeFileSync(path.join(full, `${area}-${String(c).padStart(3, "0")}.yaml`), renderConfig(area, c));
  }

  // READMEs.
  const rootName = spec.outName;
  const readmeDirs = ["apps", "packages", "services", "tests", "docs", "config"];
  for (let r = 0; r < spec.readmeCount; r += 1) {
    const area = docAreas[r % docAreas.length];
    const full = ensureDir(root, readmeDirs[r % readmeDirs.length] + "/" + area);
    fs.writeFileSync(path.join(full, "README.md"), `# ${area}\n\nPart of ${rootName}. See docs.\n`);
  }
  fs.writeFileSync(path.join(root, "README.md"), `# ${rootName}\n\nGenerated extreme benchmark repository.\n`);
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    "# repo-internal ignores\nnode_modules/\ndist/\nbuild/\ncoverage/\nvendor/\n.next/\n.codeatlas/\n",
  );

  // Ignored-directory junk (scanner must skip these).
  const ignoredDirs = ["node_modules/fake-pkg/src", "dist/bundles", "build/artifacts", "coverage/lcov", "vendor/libs", ".next/cache"];
  for (let i = 0; i < spec.ignoredFiles; i += 1) {
    const dir = ignoredDirs[i % ignoredDirs.length];
    const full = ensureDir(root, dir);
    fs.writeFileSync(path.join(full, `junk-${String(i).padStart(4, "0")}.ts`), `export const junk${i} = ${i};\n`);
  }

  writeExtremeGitignore();
  const elapsedMs = Date.now() - t0;
  return { records, elapsedMs };
}

function verifyRepo(root) {
  let totalLines = 0;
  let fileCount = 0;
  let minLines = Infinity;
  let maxLines = 0;
  const byExt = new Map();
  const dirs = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        dirs.add(full);
        walk(full);
      } else {
        const ext = path.extname(e.name);
        byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
        const lines = countLinesOf(full);
        totalLines += lines;
        fileCount += 1;
        if (lines < minLines) minLines = lines;
        if (lines > maxLines) maxLines = lines;
      }
    }
  };
  walk(root);
  return {
    fileCount,
    totalLines,
    avgLines: fileCount === 0 ? 0 : Math.round(totalLines / fileCount),
    minLines: minLines === Infinity ? 0 : minLines,
    maxLines,
    dirCount: dirs.size,
    byExt: Object.fromEntries([...byExt.entries()].sort((a, b) => b[1] - a[1])),
  };
}

function countLinesOf(file) {
  let n = 0;
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1024 * 1024);
  let chunk;
  try {
    while ((chunk = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let i = 0; i < chunk; i += 1) {
        if (buf[i] === 10) n += 1;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return n + 1;
}

function bytesOf(dir) {
  let s = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else s += fs.statSync(full).size;
    }
  };
  walk(dir);
  return s;
}

async function main() {
  const spec = REPO_SPECS[REPO];
  if (spec === undefined) {
    console.error(`Unknown repo: ${REPO} (use "a" or "b")`);
    process.exit(1);
  }
  if (VERIFY_ONLY) {
    const t0 = Date.now();
    const stats = verifyRepo(OUT_DIR);
    const bytes = bytesOf(OUT_DIR);
    console.log(JSON.stringify({ ...stats, bytes, verifyMs: Date.now() - t0 }, null, 2));
    return;
  }
  const genStart = Date.now();
  const { records, elapsedMs } = generateRepo(spec);
  const genMs = Date.now() - genStart;
  const stats = verifyRepo(OUT_DIR);
  const bytes = bytesOf(OUT_DIR);

  fs.writeFileSync(
    path.join(OUT_DIR, "README.md"),
    `# ${spec.outName}\n\n` +
      "CodeAtlas Extreme Repository " + (REPO === "a" ? "A" : "B") + " - deterministic stress-test fixture.\n\n" +
      "## Generation parameters\n\n" +
      `| Parameter | Value |\n|---|---|\n` +
      `| Generator | \`benchmarks/extreme/generate.mjs\` |\n` +
      `| Seed | \`0x${spec.seed.toString(16)}\` |\n` +
      `| Target TS files | ${spec.fileCount} |\n` +
      `| Target lines/file | ${spec.targetLines} |\n` +
      `| Monster files (>20k lines, reference-cap path) | ${spec.monsterFiles} |\n` +
      `| Docs (md) | ${spec.docsCount} |\n` +
      `| Config (yaml) | ${spec.configCount} |\n` +
      `| Ignored-dir junk files | ${spec.ignoredFiles} |\n\n` +
      "## Verified size\n\n" +
      `| Metric | Value |\n|---|---|\n` +
      `| File count (all) | ${stats.fileCount} |\n` +
      `| TS source files | ${records.length + spec.monsterFiles} |\n` +
      `| Total LOC | ${stats.totalLines} |\n` +
      `| Average LOC/file | ${stats.avgLines} |\n` +
      `| Minimum LOC/file | ${stats.minLines} |\n` +
      `| Maximum LOC/file | ${stats.maxLines} |\n` +
      `| Directory count | ${stats.dirCount} |\n` +
      `| Disk size (bytes) | ${bytes} (${(bytes / 1024 / 1024 / 1024).toFixed(3)} GiB) |\n` +
      `| Generation time | ${elapsedMs} ms (${(elapsedMs / 1000).toFixed(1)} s) |\n\n` +
      "## Topology\n\n" +
      "```\n" + "apps/  packages/  services/  tests/  docs/  config/\n" + "```\n\n" +
      "Generated with the same seeded generator for reproducibility; every file is valid parseable TypeScript with cross-file imports.\n"
  );

  console.log(
    JSON.stringify(
      {
        repo: REPO,
        outDir: OUT_DIR,
        generationMs: genMs,
        requestedFiles: spec.fileCount,
        requestedLinesPerFile: spec.targetLines,
        tsFilesWritten: records.length + spec.monsterFiles,
        ...stats,
        bytes,
        bytesGiB: Number((bytes / 1024 / 1024 / 1024).toFixed(3)),
      },
      null,
      2,
    ),
  );
}

await main();
