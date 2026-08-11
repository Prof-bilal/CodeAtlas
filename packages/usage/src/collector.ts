import type {
  AgentRunResult,
  ProviderPort,
  ProviderRequest,
  ProviderResponse,
  UsageEventInput,
  UsagePort,
  UsageRecord,
} from "@atlas/core";
import type { Result } from "@atlas/shared";
import { estimateTokens } from "./estimate";

/** Extra correlation metadata attached by the caller at the collection seam. */
export interface TrackingContext {
  readonly agent?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  /** Anonymized/hashed task reference — never raw task text. */
  readonly taskRef?: string;
}

/** Options for {@link withUsageTracking}. */
export interface WithUsageTrackingOptions extends TrackingContext {
  /** Also record failed provider calls (tokens unknown). Default `false`. */
  readonly recordOnError?: boolean;
  /** Provider id used when a failed request omits `provider` and `recordOnError` is on. */
  readonly defaultProvider?: string;
  /**
   * When the provider reports **no** token usage, estimate tokens from the
   * prompt/response text (character→token, ~4 chars/token) and label them
   * `estimated`. Default `false` — without this, missing usage stays `unknown`
   * (never a guess).
   */
  readonly estimateTokens?: boolean;
}

/**
 * Wrap a `ProviderPort` so every completion is timed and recorded at the port
 * boundary — **never inside provider adapters** (provider logic stays
 * quarantined). Token usage comes straight from `ProviderResponse.usage`
 * (`actual`); when the provider reports none, the record is `unknown`, never a
 * guess. Prompt text is never stored — only the returned (empty) tracking
 * fields the caller opted into.
 */
export function withUsageTracking(
  provider: ProviderPort,
  usage: UsagePort,
  options: WithUsageTrackingOptions = {},
): ProviderPort {
  return {
    async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
      const start = Date.now();
      const result = await provider.complete(request);
      const latencyMs = Date.now() - start;
      if (result.ok) {
        const response = result.value;
        const event: UsageEventInput = {
          source: "provider",
          provider: response.provider,
          model: response.model,
          latencyMs,
          ...trackingFields(options),
          ...(response.usage === undefined
            ? options.estimateTokens === true
              ? {
                  estimatedInputTokens: estimateTokens(request.prompt),
                  estimatedOutputTokens: estimateTokens(response.content),
                }
              : {}
            : {
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                totalTokens: response.usage.totalTokens,
              }),
        };
        await usage.record(event);
      } else if (options.recordOnError === true) {
        await usage.record({
          source: "provider",
          provider: request.provider ?? options.defaultProvider ?? "unknown",
          model: request.model ?? "unknown",
          latencyMs,
          ...trackingFields(options),
        });
      }
      return result;
    },
  };
}

/**
 * Record one completed AI CLI run (an `AgentRunResult`) as a usage event.
 * Agent CLIs report neither tokens nor a model, so those fields are `unknown`
 * by design — the tri-state model records that honestly instead of guessing.
 */
export async function trackAgentRun(
  usage: UsagePort,
  result: AgentRunResult,
  context: TrackingContext = {},
): Promise<Result<UsageRecord>> {
  return usage.record({
    source: "session",
    provider: result.provider,
    ...trackingFields(context),
    requestCount: 1,
    latencyMs: result.durationMs,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
  });
}

/** The optional correlation fields a caller opted into (spread-safe). */
interface TrackingFields {
  agent?: string;
  sessionId?: string;
  taskId?: string;
  taskRef?: string;
}

function trackingFields(context: TrackingContext): TrackingFields {
  const fields: TrackingFields = {};
  if (context.agent !== undefined) {
    fields.agent = context.agent;
  }
  if (context.sessionId !== undefined) {
    fields.sessionId = context.sessionId;
  }
  if (context.taskId !== undefined) {
    fields.taskId = context.taskId;
  }
  if (context.taskRef !== undefined) {
    fields.taskRef = context.taskRef;
  }
  return fields;
}
