import type { Result, SymbolId } from "@atlas/shared";
import type { SourceFile, Symbol } from "../domain/entities";

/** Extracts language-agnostic symbols from source code. */
export interface ParserPort {
  /** Parse a source file into its symbols. */
  parse(file: SourceFile): Promise<Result<readonly Symbol[]>>;

  /** Locate a previously parsed symbol. */
  resolveSymbol(id: SymbolId): Result<Symbol | undefined>;
}
