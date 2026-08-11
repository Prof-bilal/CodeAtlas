import type { ProjectId, Result } from "@atlas/shared";
import type { Project, SourceFile, Symbol } from "../domain/entities";

/** Persists and rehydrates project, file, and symbol data. */
export interface StoragePort {
  saveProject(project: Project): Promise<Result<void>>;
  loadProject(id: ProjectId): Promise<Result<Project | undefined>>;
  saveFiles(files: readonly SourceFile[]): Promise<Result<void>>;
  saveSymbols(symbols: readonly Symbol[]): Promise<Result<void>>;
}
