import { isAbsolute, relative } from "node:path";

/** File name of a gitignore rules file at a directory root. */
export const GITIGNORE_FILE_NAME = ".gitignore";

/** Cap on a single pattern line (protects the regex matcher from abuse). */
const MAX_GITIGNORE_PATTERN_LENGTH = 500;

/** Cap on the number of rules loaded per `.gitignore` file. */
const MAX_GITIGNORE_RULES = 5000;

/**
 * A single compiled `.gitignore` rule. Patterns follow the common gitignore
 * semantics: comments, negation, directory-only (trailing `/`), and globs
 * (`*`, `**`, `?`, `[...]`).
 */
export interface GitignoreRule {
  /** Pattern text after comment/negation/dir-marker stripping. */
  readonly pattern: string;
  /** `true` for `!pattern` re-include rules. */
  readonly negated: boolean;
  /** `true` for `dir/` rules, which only match directories. */
  readonly directoryOnly: boolean;
  /** `true` when the pattern is anchored to the owning directory. */
  readonly anchored: boolean;
  /** Matcher against a `/`-separated path relative to the owning directory. */
  readonly regex: RegExp;
  /** For `dir/` rules: matches anything *inside* the ignored directory. */
  readonly descendantRegex: RegExp | null;
}

/** A `.gitignore` file scoped to the directory that owns it. */
export interface GitignoreScope {
  /** Absolute path of the directory whose contents the rules describe. */
  readonly base: string;
  readonly rules: readonly GitignoreRule[];
}

/**
 * Parse the contents of a `.gitignore` file into compiled rules.
 *
 * Returns an empty array for empty files and for files that only contain
 * comments/blank lines. Invalid (unmatchable) patterns are skipped.
 */
export function parseGitignore(content: string): readonly GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.slice(0, MAX_GITIGNORE_PATTERN_LENGTH).replace(/\s+$/, "");
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    if (line === "") {
      continue;
    }
    let directoryOnly = false;
    if (line.endsWith("/")) {
      directoryOnly = true;
      line = line.slice(0, -1);
    }
    if (line === "") {
      continue;
    }
    // A leading slash (or any slash in the middle) anchors to the base dir.
    let anchored = line.startsWith("/");
    if (anchored) {
      line = line.slice(1);
    }
    if (line === "") {
      continue;
    }
    if (!anchored && line.includes("/")) {
      anchored = true;
    }
    const { regex, descendantRegex } = globToRegExp(line, anchored, directoryOnly);
    rules.push({
      pattern: line,
      negated,
      directoryOnly,
      anchored,
      regex,
      descendantRegex,
    });
    if (rules.length >= MAX_GITIGNORE_RULES) {
      break;
    }
  }
  return rules;
}

/**
 * Immutable matcher over a stack of `.gitignore` scopes (root first, nested
 * scopes appended after). Rules from later scopes and later lines override
 * earlier matches — matching git's precedence. Never matches paths outside a
 * scope's base directory.
 */
export class GitignoreMatcher {
  private constructor(
    private readonly scopes: readonly GitignoreScope[],
    private readonly enabled: boolean,
  ) {}

  /** A matcher with no rules (gitignore support enabled, nothing loaded). */
  public static empty(): GitignoreMatcher {
    return new GitignoreMatcher([], true);
  }

  /** A matcher that never ignores anything (gitignore support disabled). */
  public static disabled(): GitignoreMatcher {
    return new GitignoreMatcher([], false);
  }

  /** Return a matcher that also applies `rules` scoped to `base`. */
  public withScope(base: string, rules: readonly GitignoreRule[]): GitignoreMatcher {
    if (!this.enabled || rules.length === 0) {
      return this;
    }
    return new GitignoreMatcher([...this.scopes, { base, rules }], true);
  }

  /**
   * Whether `path` should be excluded from the scan.
   *
   * @param path - Absolute path of the entry (file or directory).
   * @param isDirectory - Whether the entry is a directory.
   */
  public isIgnored(path: string, isDirectory: boolean): boolean {
    if (!this.enabled) {
      return false;
    }
    let ignored = false;
    for (const scope of this.scopes) {
      const rel = relative(scope.base, path);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        continue; // outside this scope
      }
      const relSlash = rel.split("\\").join("/");
      for (const rule of scope.rules) {
        if (rule.directoryOnly) {
          if (rule.regex.test(relSlash)) {
            if (isDirectory) {
              ignored = !rule.negated;
            }
          } else if (rule.descendantRegex?.test(relSlash)) {
            // A file/dir inside an ignored directory is ignored too.
            ignored = !rule.negated;
          }
          continue;
        }
        if (rule.regex.test(relSlash)) {
          ignored = !rule.negated;
        }
      }
    }
    return ignored;
  }
}

/** Escape a single regex metacharacter for use inside a compiled pattern. */
function escapeRegExpChar(ch: string): string {
  return /[\\^$.|?*+()[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Convert a gitignore glob into a `^...$` regex body. For `dir/` rules, also
 * build a descendant matcher so anything *inside* the ignored directory is
 * excluded (git semantics), without excluding a file named exactly `dir`.
 */
function globToRegExp(
  glob: string,
  anchored: boolean,
  directoryOnly: boolean,
): { readonly regex: RegExp; readonly descendantRegex: RegExp | null } {
  let body = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          body += "(?:.*/)?";
          i += 2;
        } else {
          body += ".*";
          i += 1;
        }
      } else {
        body += "[^/]*";
      }
    } else if (ch === "?") {
      body += "[^/]";
    } else if (ch === "[") {
      const close = glob.indexOf("]", i + 1);
      if (close === -1) {
        body += "\\[";
        continue;
      }
      let cls = glob.slice(i + 1, close);
      if (cls.startsWith("!")) {
        cls = `^${cls.slice(1)}`;
      }
      cls = cls.replace(/[\\^$.|?*+()[\]{}]/g, (m) => `\\${m}`);
      body += `[${cls}]`;
      i = close;
    } else {
      body += escapeRegExpChar(ch);
    }
  }
  // A pattern without a slash matches at any depth below the owning dir.
  const prefix = anchored ? "^" : "(?:^|.*/)";
  const regex = new RegExp(`${prefix}${body}$`);
  const descendantRegex = directoryOnly ? new RegExp(`${prefix}${body}/.+$`) : null;
  return { regex, descendantRegex };
}
