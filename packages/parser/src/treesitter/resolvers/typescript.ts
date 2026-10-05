import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { firstKnownFile, resolveRelativePath } from "./module-resolver";

/** TypeScript-source candidates for an explicit `./x.js` specifier. */
function jsToTsCandidates(resolved: string): string[] {
  if (resolved.endsWith(".js")) {
    return [`${resolved.slice(0, -3)}.ts`, `${resolved.slice(0, -3)}.tsx`];
  }
  if (resolved.endsWith(".jsx")) {
    return [`${resolved.slice(0, -4)}.tsx`];
  }
  return [];
}

/**
 * The TypeScript/JavaScript resolver: relative `./`/`../` specifiers only, with
 * `jsToTsCandidates` (`.js` → `.ts`/`.tsx`) unified with the graph's previous
 * resolver so the parser and graph never diverge (audit item A2).
 */
export const TYPESCRIPT_RESOLVER: ModuleResolver = {
  id: "typescript",
  resolve(fromFile: FilePath, specifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return undefined;
    }
    const resolved = resolveRelativePath(fromFile, specifier);
    return firstKnownFile(
      [
        resolved,
        ...jsToTsCandidates(resolved),
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}/index.ts`,
        `${resolved}/index.tsx`,
      ],
      knownFiles,
    );
  },
};
