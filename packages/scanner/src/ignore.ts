/**
 * Directories the scanner always skips, regardless of project configuration.
 * Matched case-insensitively so variants like `DIST` or `Vendor` are ignored.
 */
export const DEFAULT_IGNORED_DIRECTORIES: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  ".codeatlas",
];

/**
 * Create a predicate that reports whether a directory name should be ignored.
 *
 * @param ignored - Directory names to ignore. Defaults to
 *   {@link DEFAULT_IGNORED_DIRECTORIES}. Matching is case-insensitive.
 * @returns A function accepting a directory name and returning `true` when it
 *   should be skipped.
 */
export function createIgnoreMatcher(
  ignored: readonly string[] = DEFAULT_IGNORED_DIRECTORIES,
): (directoryName: string) => boolean {
  const normalized = new Set(ignored.map((name) => name.toLowerCase()));
  return (directoryName: string): boolean => normalized.has(directoryName.toLowerCase());
}
