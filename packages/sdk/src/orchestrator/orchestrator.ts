import type { OrchestrationRun, OrchestratorPort, SessionPort, TaskPlan } from "@atlas/core";
import type { ContextIntegration } from "../context-integration/index";
import { combineResults, renderCombinedReport } from "./combine";
import { executePlan } from "./executor";
import { buildPlan, reviewPlan } from "./plan";

/** Options for {@link createOrchestrator}. */
export interface CreateOrchestratorOptions {
  /**
   * The Agent Session Manager every role runs through
   * (e.g. from `createSessionManager()`). The orchestrator never spawns
   * directly — it drives this port.
   */
  readonly sessions: SessionPort;
  /**
   * The Context → Agent integration every role's Context Package comes from
   * (e.g. from `createContextIntegration()`).
   */
  readonly integration: ContextIntegration;
  /** Timeout applied to roles that omit their own `timeoutMs`. */
  readonly defaultTimeoutMs?: number;
  /** Retry cap applied to roles that omit their own `maxRetries`. */
  readonly maxRetries?: number;
  /** How often a role's session is polled for its terminal state. */
  readonly pollIntervalMs?: number;
}

/**
 * The Multi-Agent Orchestrator (Task 17): turns a bounded {@link TaskPlan} into
 * a run of explicit agent roles through `SessionPort`, collecting and combining
 * their results. It is the Coordinator/Supervisor — it decides what each agent
 * runs and when, cancels the remaining roles on failure, and never leaves
 * orphan children. See {@link OrchestratorPort}.
 */
export interface Orchestrator extends OrchestratorPort {
  /** Deterministically decompose a user task into a bounded plan. */
  buildPlan: typeof buildPlan;
  /** The built-in parallel 3-role review scenario (the example workflow). */
  reviewPlan: typeof reviewPlan;
  /** Collect role outputs into an attributed, conflict-surfaced report. */
  combine: typeof combineResults;
  /** Render a combined report to text. */
  render: typeof renderCombinedReport;
}

/** Create the Multi-Agent Orchestrator over `SessionPort` + context integration. */
export function createOrchestrator(options: CreateOrchestratorOptions): Orchestrator {
  const { sessions, integration } = options;
  /** Latest snapshot per run id (updated as the run progresses/completes). */
  const runs = new Map<string, OrchestrationRun>();
  /** Per-run cancel hooks; removed once a run completes. */
  const cancels = new Map<string, () => void>();
  let latestRunId: string | undefined;

  return {
    buildPlan,
    reviewPlan,
    combine: combineResults,
    render: renderCombinedReport,

    async orchestrate(plan: TaskPlan): Promise<OrchestrationRun> {
      const controller = { cancelled: false };
      runs.set(plan.id, { plan, status: "running", results: [] });
      cancels.set(plan.id, () => {
        controller.cancelled = true;
      });
      latestRunId = plan.id;

      const outcome = await executePlan({
        sessions,
        integration,
        plan,
        ...(options.defaultTimeoutMs !== undefined
          ? { defaultTimeoutMs: options.defaultTimeoutMs }
          : {}),
        ...(options.maxRetries !== undefined ? { defaultMaxRetries: options.maxRetries } : {}),
        ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {}),
        isCancelled: () => controller.cancelled,
        onProgress: (results) => {
          runs.set(plan.id, { plan, status: "running", results });
        },
      });

      const run: OrchestrationRun = { plan, status: outcome.status, results: outcome.results };
      runs.set(plan.id, run);
      cancels.delete(plan.id);
      latestRunId = plan.id;
      return run;
    },

    async cancel(runId?: string): Promise<void> {
      const id = runId ?? latestRunId;
      if (id === undefined) {
        return;
      }
      cancels.get(id)?.();
    },

    getRun(runId?: string): OrchestrationRun | undefined {
      const id = runId ?? latestRunId;
      return id === undefined ? undefined : runs.get(id);
    },
  };
}
