import type { Reference, Symbol } from "@atlas/core";
import type { SymbolId } from "@atlas/shared";

/**
 * A {@link Symbol} enriched with its position in the symbol index.
 *
 * In addition to the normalized symbol fields (name, type, file, line, parent,
 * documentation, ...), an indexed symbol exposes the usages that resolve to it
 * and its direct children.
 */
export interface IndexedSymbol extends Symbol {
  /** Direct children (e.g. a class's methods and properties). */
  readonly children: readonly SymbolId[];
  /** Usages across the indexed corpus that resolve to this symbol. */
  readonly references: readonly Reference[];
}
