/**
 * Deterministic fuzzy-text helpers used by the search scorer.
 *
 * Matching is case-insensitive. Nearest-neighbour matching happens on
 * identifier-like fields (names, paths, targets) where a small typo should not
 * hide a result; long prose (file contents, summaries) is matched by substring
 * instead, which is both cheaper and precise.
 */

/** Levenshtein (edit) distance between two strings, case-insensitively. */
export function editDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const n = a.length;
  const m = b.length;

  if (n === 0) {
    return m;
  }
  if (m === 0) {
    return n;
  }

  let previous = new Array<number>(m + 1);
  let current = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) {
    previous[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    current[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost, // substitution
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[m];
}

/** Worst edit distance tolerated for a fuzzy match of an identifier of `length`. */
export function fuzzyThreshold(length: number): number {
  if (length <= 1) {
    return 0; // single character must be exact
  }
  if (length <= 4) {
    return 1; // short identifiers tolerate one typo
  }
  if (length <= 8) {
    return 2;
  }
  return Math.ceil(length / 4); // longer names tolerate proportionally more
}

/** Similarity in `[0, 1]`: `1 − distance / maxLength`. */
export function similarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - editDistance(left, right) / maxLength;
}

/** True when `candidate` is close enough to `query` to count as a fuzzy match. */
export function isFuzzyMatch(query: string, candidate: string): boolean {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (q.length === 0 || c.length === 0) {
    return false;
  }
  const threshold = fuzzyThreshold(q.length);
  if (threshold === 0) {
    return q === c;
  }
  return editDistance(q, c) <= threshold;
}

/** True when `query` appears in `text` as a whole token (word-boundary match). */
export function isTokenMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) {
    return false;
  }
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`).test(t);
}
