import type {
  BenchmarkAblationConfig,
  BenchmarkRunRequest,
  BenchmarkRunner,
  RunnerRequest,
  RunnerResult,
} from "@atlas/core";
import type { Result } from "@atlas/shared";

/**
 * Ablation service for Phase 8 (P8.2).
 *
 * Generates ablation scenarios by toggling intel features off one at a time,
 * then wraps a runner to apply those toggles during execution.
 *
 * Each ablation scenario produces a modified `RunnerRequest` that can be
 * intercepted by the runner to skip the corresponding feature (e.g., omit
 * plan steps from the prompt, disable verification loops, etc.).
 */

/** An ablation scenario: a named config with one or more features disabled. */
export interface AblationScenario {
  /** Human-readable label (e.g. "no-planner"). */
  readonly label: string;
  /** The ablation config (features to disable). */
  readonly config: BenchmarkAblationConfig;
}

/**
 * All single-feature ablation scenarios.
 *
 * Each scenario disables exactly one intel feature while keeping the rest
 * enabled. Combined with the full-intel baseline, this yields 5 data points
 * per task (full + 4 single-ablations).
 */
export const SINGLE_ABLATION_SCENARIOS: readonly AblationScenario[] = [
  {
    label: "full-intel",
    config: {},
  },
  {
    label: "no-planner",
    config: { disablePlanner: true },
  },
  {
    label: "no-hierarchy",
    config: { disableHierarchy: true },
  },
  {
    label: "no-verification",
    config: { disableVerification: true },
  },
  {
    label: "no-critic",
    config: { disableCritic: true },
  },
];

/**
 * Generate a unique task ID suffix for an ablation scenario.
 *
 * Example: `"R1-T01#no-planner"`
 */
export function ablationTaskId(baseTaskId: string, scenarioLabel: string): string {
  return `${baseTaskId}#${scenarioLabel}`;
}

/**
 * Generate ablation benchmark run requests for a single task.
 *
 * For each ablation scenario, produces a `BenchmarkRunRequest` with a
 * modified task ID (appended with `#<scenario>`) so results are stored
 * independently. The caller is responsible for actually running these.
 */
export function generateAblationRequests(
  baseRequest: BenchmarkRunRequest,
  scenarios: readonly AblationScenario[] = SINGLE_ABLATION_SCENARIOS,
): readonly (BenchmarkRunRequest & { readonly scenario: AblationScenario })[] {
  return scenarios.map((scenario) => ({
    ...baseRequest,
    taskId: ablationTaskId(baseRequest.taskId, scenario.label),
    scenario,
  }));
}

/**
 * Wrap a runner to apply ablation config to every request.
 *
 * The wrapper intercepts the request and annotates it with the ablation
 * config. The actual feature-skip logic lives in the runner or the
 * `ToolLoopConfig` construction — this wrapper ensures the config is
 * propagated.
 */
export class AblationRunner implements BenchmarkRunner {
  public readonly name: BenchmarkRunner["name"];

  private readonly inner: BenchmarkRunner;
  private readonly ablationConfig: BenchmarkAblationConfig;

  public constructor(inner: BenchmarkRunner, ablationConfig: BenchmarkAblationConfig) {
    this.inner = inner;
    this.name = inner.name;
    this.ablationConfig = ablationConfig;
  }

  public async execute(request: RunnerRequest): Promise<Result<RunnerResult>> {
    // Annotate request with ablation config for downstream consumers
    const annotated: RunnerRequest & { readonly ablationConfig?: BenchmarkAblationConfig } = {
      ...request,
      ablationConfig: this.ablationConfig,
    };
    return this.inner.execute(annotated as RunnerRequest);
  }
}

/**
 * Filter task results to only include those matching the ablation scenario.
 *
 * In ablation mode, task IDs are suffixed with `#<scenario>`. This helper
 * extracts the base task ID for aggregation.
 */
export function extractBaseTaskId(ablationTaskId: string): string {
  const hashIdx = ablationTaskId.indexOf("#");
  return hashIdx === -1 ? ablationTaskId : ablationTaskId.slice(0, hashIdx);
}

/**
 * Extract the ablation scenario label from a suffixed task ID.
 * Returns `null` if the task ID has no ablation suffix.
 */
export function extractScenarioLabel(ablationTaskId: string): string | null {
  const hashIdx = ablationTaskId.indexOf("#");
  return hashIdx === -1 ? null : ablationTaskId.slice(hashIdx + 1);
}
