/**
 * The secret deny-filter for the Context → Agent integration layer.
 *
 * A context package must never include `.env*`, credentials, private keys, or
 * configuration with keys. Any selected file whose **path** matches a known
 * secret-file pattern, or whose **content** contains a high-confidence
 * credential, is dropped entirely and recorded in the package's exclusion
 * record. The filter is deliberately conservative: when in doubt, drop and
 * report.
 */

export interface DenyFilterResult {
  /** True when the file is safe to include. */
  readonly accepted: boolean;
  /** Path patterns that matched (when the file was dropped by path). */
  readonly pathPatterns: readonly string[];
  /** Content patterns that matched (when the file was dropped by content). */
  readonly contentPatterns: readonly string[];
}

/** Path-level patterns: a basename match excludes the whole file. */
interface PathDenyPattern {
  readonly pattern: string;
  readonly re: RegExp;
}

const PATH_DENY_PATTERNS: readonly PathDenyPattern[] = [
  // `.env`, `.env.local`, `.env.production`, … — never send any `.env*`.
  { pattern: ".env*", re: /^\.env(?:\.\w+)?$/ },
  // Private-key and credential material.
  { pattern: "*.pem", re: /\.pem$/i },
  { pattern: "*.key", re: /\.key$/i },
  { pattern: "*.p12/.pfx", re: /\.(p12|pfx)$/i },
  { pattern: "*.jks/.keystore", re: /\.(jks|keystore)$/i },
  { pattern: "id_rsa/id_dsa/id_ed25519", re: /^id_(rsa|dsa|ed25519|ecdsa)$/i },
  {
    pattern: "credentials/secret files",
    re: /^(credentials|secret|secrets)$/i,
  },
  // Whole secret directories (`.ssh`, `.aws`, `.gcloud`).
  { pattern: ".*.ssh/.aws/.gcloud dirs", re: /^\.(ssh|aws|gcloud)$/i },
  // JSON secret bundles (`secrets.json`, `secrets.local.json`, …).
  { pattern: "secrets*.json", re: /^secrets?(?:[-_.]?\w+)*\.json$/i },
];

/** Content-level patterns: a high-confidence credential match excludes the file. */
interface ContentDenyPattern {
  readonly pattern: string;
  readonly match: (content: string) => boolean;
}

const CONTENT_DENY_PATTERNS: readonly ContentDenyPattern[] = [
  {
    pattern: "private key block",
    match: (content) =>
      /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/.test(content),
  },
  {
    pattern: "AWS access key",
    match: (content) => /\bAKIA[0-9A-Z]{16}\b/.test(content),
  },
  {
    pattern: "Google API key",
    match: (content) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(content),
  },
  {
    pattern: "OpenAI-style secret key",
    match: (content) => /\bsk-[A-Za-z0-9]{20,}\b/.test(content),
  },
  {
    pattern: "GitHub personal access token",
    match: (content) => /\bghp_[A-Za-z0-9]{36}\b/.test(content),
  },
  {
    pattern: "GitHub fine-grained token",
    match: (content) => /\bgithub_pat_[A-Za-z0-9_]{30,}\b/.test(content),
  },
  {
    pattern: "Slack token",
    match: (content) => /\b(xox[baprs]-)[A-Za-z0-9-]{10,}\b/.test(content),
  },
  {
    pattern: "inline credential assignment",
    match: (content) => matchesInlineCredential(content),
  },
];

/**
 * A `key = value`-style assignment whose value looks like a real credential.
 * Placeholder values (`your-key`, `example`, `<…>`, `xxx`) are tolerated so
 * docs and instruction files that show *examples* are not dropped.
 */
function matchesInlineCredential(content: string): boolean {
  const re =
    /\b(?:api[_-]?key|apikey|secret|token|passwd|password|client[_-]?secret|access[_-]?key|auth[_-]?token|private[_-]?key)\b\s*[:=]\s*(?:"|')?([^\s"']+)/gi;
  for (const match of content.matchAll(re)) {
    const value = match[1];
    if (value === undefined || value.length < 12) {
      continue;
    }
    if (/(?:your|example|placeholder|change|xxx|<|>|\.\.\.)/i.test(value)) {
      continue;
    }
    if (/^(?:null|undefined|true|false|none)$/i.test(value)) {
      continue;
    }
    return true;
  }
  return false;
}

/** The basename of a path, split on either separator. */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Run the deny-filter over a file. A path-level match short-circuits the
 * content scan (the file is dropped and the reason recorded).
 */
export function denyFilter(path: string, content: string): DenyFilterResult {
  const pathPatterns: string[] = [];
  const base = basename(path);
  for (const entry of PATH_DENY_PATTERNS) {
    if (entry.re.test(base)) {
      pathPatterns.push(entry.pattern);
    }
  }
  if (pathPatterns.length > 0) {
    return { accepted: false, pathPatterns, contentPatterns: [] };
  }

  const contentPatterns: string[] = [];
  for (const entry of CONTENT_DENY_PATTERNS) {
    if (entry.match(content)) {
      contentPatterns.push(entry.pattern);
    }
  }
  return {
    accepted: contentPatterns.length === 0,
    pathPatterns,
    contentPatterns,
  };
}
