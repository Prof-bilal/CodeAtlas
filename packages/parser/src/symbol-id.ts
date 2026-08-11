import type { SymbolLocation } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";

/**
 * Build a deterministic, human-readable {@link SymbolId} from a declaration's
 * source span.
 *
 * Two symbols declared at the same position in the same file always receive the
 * same id, so re-parsing an unchanged file is idempotent and symbol ids can be
 * used as stable keys across runs.
 *
 * @param filePath - Absolute path of the file containing the symbol.
 * @param name - The symbol's name.
 * @param location - The symbol's 1-based source span.
 * @returns A {@link SymbolId} unique within the file.
 */
export function createSymbolId(
  filePath: FilePath,
  name: string,
  location: SymbolLocation,
): SymbolId {
  return `${filePath}#${name}@${location.startLine}:${location.startColumn}` as SymbolId;
}
