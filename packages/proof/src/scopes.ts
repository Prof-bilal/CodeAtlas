/** Validate and normalize repository-relative scopes. */
export function scopes(paths: readonly string[]): string[] {
  if (
    paths.length > 64 ||
    paths.some(
      (p) =>
        p !== "." &&
        (!p ||
          p.length > 1000 ||
          p.startsWith("/") ||
          p.includes("\\") ||
          p.split("/").some((s) => s === ".." || s === "." || !s) ||
          p.includes("\0")),
    )
  )
    throw new Error("Invalid repository-relative scope.");
  return [...new Set(paths)].sort();
}
