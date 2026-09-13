import type { Result } from "@atlas/shared";

/**
 * A single changed file or symbol in a diff.
 */
export interface ImpactSubject {
  /** Absolute or repo-relative file path. */
  readonly path: string;
  /** Optional symbol name within the file. When omitted, the whole file is the subject. */
  readonly symbol?: string | undefined;
}

/**
 * A node in the reverse-dependency closure: a file or symbol that is affected
 * by a change to one of the impact subjects.
 */
export interface AffectedNode {
  /** Repo-relative file path of the affected node. */
  readonly path: string;
  /** Symbol name, or null when the affected node is a whole file. */
  readonly symbol: string | null;
  /**
   * How far (in hops) this node is from the nearest changed subject.
   * Direct dependents = 1; transitive = 2+.
   */
  readonly distance: number;
  /** Whether this node appears to be a test file (heuristic: path contains test/spec). */
  readonly isTestFile: boolean;
  /** Whether this node appears to be a documentation file (.md, .mdx). */
  readonly isDocFile: boolean;
}

/**
 * Risk scoring for the change set (0 = no risk, 1 = maximum risk).
 * Deterministic — no AI involved.
 */
export interface ImpactRiskScore {
  /**
   * Fraction of the graph's nodes in the reverse-closure (0–1).
   * Higher = more of the codebase is affected.
   */
  readonly fanOutRatio: number;
  /**
   * Number of directly affected nodes (distance === 1).
   */
  readonly directDependents: number;
  /**
   * Total affected nodes (all distances).
   */
  readonly totalAffected: number;
  /**
   * Number of affected test files.
   */
  readonly affectedTests: number;
  /**
   * Number of affected documentation files.
   */
  readonly affectedDocs: number;
  /**
   * Composite risk level derived from fanOutRatio and directDependents.
   * Thresholds: low < 0.05, medium < 0.20, high >= 0.20.
   */
  readonly level: "low" | "medium" | "high";
}

/** The full result of an impact analysis. */
export interface ImpactResult {
  /** The subjects that were analyzed. */
  readonly subjects: readonly ImpactSubject[];
  /** All nodes in the transitive reverse-dependency closure. */
  readonly affected: readonly AffectedNode[];
  /** Risk summary for the change set. */
  readonly risk: ImpactRiskScore;
  /** Milliseconds taken to compute the result. */
  readonly durationMs: number;
}

/** Options controlling the scope of impact analysis. */
export interface ImpactOptions {
  /**
   * Maximum traversal depth for the reverse-dependency closure.
   * Default: unlimited (0 or undefined). Set to 1 for direct dependents only.
   */
  readonly maxDepth?: number | undefined;
  /**
   * When true, include test files in the closure even if they are
   * typically excluded from the reverse-dep walk.
   * Default: true.
   */
  readonly includeTests?: boolean | undefined;
  /**
   * When true, include documentation files (.md, .mdx) in the closure.
   * Default: true.
   */
  readonly includeDocs?: boolean | undefined;
}

/**
 * Port for computing the blast radius of a change set.
 * Implemented in `@atlas/graph`, composed in `@atlas/sdk`.
 */
export interface ImpactPort {
  /**
   * Compute the reverse-dependency closure for the given subjects.
   * Returns an `ImpactResult` with all affected nodes and risk scoring.
   * This operation is read-only and deterministic.
   */
  analyze(
    subjects: readonly ImpactSubject[],
    options?: ImpactOptions,
  ): Promise<Result<ImpactResult>>;
}
