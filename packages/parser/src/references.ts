import type { Reference, Symbol } from "@atlas/core";
import type { SymbolId } from "@atlas/shared";

/**
 * Resolve each reference to a same-file definition using two name-based
 * heuristics:
 *
 * 1. When the reference lies inside a class/interface/enum, prefer a member of
 *    that container with the same name (e.g. `this.start()` inside a class).
 * 2. Otherwise, match a module-level symbol or import binding with the same
 *    name in the same file.
 *
 * This is language-agnostic — it operates purely on the normalized
 * {@link Symbol} model, so every parser can reuse it. References that do not
 * match remain unresolved (`targetSymbolId: null`) and may be resolved across
 * files by the symbol indexer.
 *
 * Performance: lookup structures are built **once** per file (O(symbols)),
 * then every reference resolves in O(containers) worst case with O(1) member
 * and module-symbol lookups. The previous implementation re-filtered the
 * symbol array inside the reference loop, making a single 50k-line file
 * quadratic in its (very large) symbol + reference counts.
 */
export function resolveReferenceTargets(
  references: readonly Reference[],
  symbols: readonly Symbol[],
): Reference[] {
  const moduleSymbolsByName = new Map<string, Symbol>();
  const membersByContainer = new Map<SymbolId, Map<string, Symbol>>();
  const containers: Symbol[] = [];

  for (const symbol of symbols) {
    if (symbol.parentId === null && !moduleSymbolsByName.has(symbol.name)) {
      moduleSymbolsByName.set(symbol.name, symbol);
    }
    if (symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "enum") {
      containers.push(symbol);
    }
  }

  // First symbol with a given (parent, name) wins, mirroring the original
  // `symbols.find(...)` semantics for overloads and duplicate members.
  for (const symbol of symbols) {
    if (symbol.parentId === null) {
      continue;
    }
    let members = membersByContainer.get(symbol.parentId);
    if (members === undefined) {
      members = new Map<string, Symbol>();
      membersByContainer.set(symbol.parentId, members);
    }
    if (!members.has(symbol.name)) {
      members.set(symbol.name, symbol);
    }
  }

  return references.map((reference) => {
    const container = containers.find((candidate) => contains(candidate, reference));
    if (container !== undefined) {
      const member = membersByContainer.get(container.id)?.get(reference.name);
      if (member !== undefined) {
        return { ...reference, targetSymbolId: member.id };
      }
    }

    const moduleMatch = moduleSymbolsByName.get(reference.name);
    if (moduleMatch !== undefined) {
      return { ...reference, targetSymbolId: moduleMatch.id };
    }

    return reference;
  });
}

/** Whether `reference` falls within the source span of `container`. */
function contains(container: Symbol, reference: Reference): boolean {
  return (
    container.location.startLine <= reference.location.startLine &&
    reference.location.endLine <= container.location.endLine
  );
}
