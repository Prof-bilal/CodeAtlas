import type { ContextBuilderPort, ContextItem } from "@atlas/core";
import type { FilePath, Result } from "@atlas/shared";
import { ComingSoonError } from "@atlas/shared";

/**
 * Ranks and assembles the context to feed to a language model, behind the
 * `ContextBuilderPort` contract.
 *
 * This is a structural stub — context ranking is intentionally not implemented
 * yet. Every method throws `ComingSoonError` until the feature is built.
 */
export class ContextBuilderService implements ContextBuilderPort {
  async build(_query: string, _limit?: number): Promise<Result<readonly ContextItem[]>> {
    throw new ComingSoonError("context.build");
  }

  async sourceFile(_path: FilePath): Promise<Result<ContextItem | undefined>> {
    throw new ComingSoonError("context.sourceFile");
  }
}
