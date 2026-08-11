import type { Reference, Symbol } from "@atlas/core";

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
 */
export function resolveReferenceTargets(
  references: readonly Reference[],
  symbols: readonly Symbol[],
): Reference[] {
  const moduleSymbols = symbols.filter((symbol) => symbol.parentId === null);
  const containers = symbols.filter(
    (symbol) => symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "enum",
  );

  return references.map((reference) => {
    const container = containers.find((candidate) => contains(candidate, reference));
    if (container !== undefined) {
      const member = symbols.find(
        (symbol) => symbol.parentId === container.id && symbol.name === reference.name,
      );
      if (member !== undefined) {
        return { ...reference, targetSymbolId: member.id };
      }
    }

    const moduleMatch = moduleSymbols.find((symbol) => symbol.name === reference.name);
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
