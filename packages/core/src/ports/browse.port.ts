import type { Result } from "@prof-bilal/atlas-shared";

export interface BrowseViewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Fixed, bounded interaction vocabulary for `BrowsePort.interact`. Values are
 * argument-array encoded; targets must come from a prior snapshot's element
 * references — never from free-form page-derived text.
 */
/** A bounded keyboard key name (single character or a fixed named key). */
export type BrowseKey =
  | "Enter"
  | "Escape"
  | "Tab"
  | "ArrowDown"
  | "ArrowUp"
  | "ArrowLeft"
  | "ArrowRight";

export type BrowseInteraction =
  | { readonly kind: "click"; readonly ref: string }
  | { readonly kind: "hover"; readonly ref: string }
  | { readonly kind: "fill"; readonly ref: string; readonly text: string }
  | { readonly kind: "press"; readonly key: BrowseKey };

export interface BrowseEvidence {
  readonly operation: "snapshot" | "screenshot" | "console" | "responsive" | "interact";
  readonly url: string;
  readonly viewport?: BrowseViewport;
  readonly label?: string;
  readonly path: string | null;
  readonly output: string;
  readonly ok: boolean;
}

export interface BrowsePort {
  snapshot(url: string, label?: string): Promise<Result<BrowseEvidence>>;
  screenshot(
    url: string,
    viewport?: BrowseViewport,
    label?: string,
  ): Promise<Result<BrowseEvidence>>;
  console(url: string, label?: string): Promise<Result<BrowseEvidence>>;
  responsive(
    url: string,
    viewports: readonly BrowseViewport[],
    label?: string,
  ): Promise<Result<readonly BrowseEvidence[]>>;
  /**
   * Perform bounded page interactions (click/hover/fill/press) using element
   * references from a prior snapshot, then capture the resulting state as
   * labeled evidence. Interaction targets are untrusted page data: the service
   * must encode them as argument-array values, never through a shell.
   */
  interact(
    url: string,
    interactions: readonly BrowseInteraction[],
    options?: { readonly viewport?: BrowseViewport; readonly label?: string },
  ): Promise<Result<BrowseEvidence>>;
}
