import type {
  ChatAgentCallTrace,
  ChatAgentMessageTrace,
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  PlanStep,
  ProviderMessage,
  ProviderPort,
  ToolCall,
  ToolDefinition,
  VerificationStrategy,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  type StopReason,
  addKnownFacts,
  createAgentState,
  nextRound,
  recordFileInspected,
  recordToolUsage,
  renderStateSummary,
  setClassification,
  setPlan,
  setStopReason,
} from "./state";
import type { ContextToolSource, ToolCallPolicy } from "./types";
import { MAX_TOOL_RESULT_CHARS, MAX_TOOL_ROUNDS, evaluateToolCallPolicy } from "./types";

/**
 * Behavioral guidance injected into the first user message (beta audit Fix 1).
 *
 * The audit showed agents treat context tools as exploration methods (18+
 * calls) instead of context shortcuts (1–5 calls). This guidance primes the
 * model to trust the delivered context and search only for gaps.
 */
export const CONTEXT_GUIDANCE =
  "CodeAtlas has provided context about the codebase. Use this context to answer.\n" +
  "Do NOT read files that are already in the context.\n" +
  "Call search/read tools only for information not in the context.\n" +
  "Typical usage: 1-5 tool calls per task. If you've called tools more than 5 times, " +
  "recommend answering with what you have.";

/** Rounds of low information growth before the progress note fires. */
const LOW_GROWTH_ROUNDS = 2;
/** A round must add at least this fraction of new content to count as progress. */
const LOW_GROWTH_THRESHOLD = 0.05;

/** Minimum characters for a tool result to be considered informative. */
const MIN_INFORMATIVE_RESULT_CHARS = 10;

/**
 * Configuration for the tool loop (Phase 5, P5.2–P5.4).
 *
 * Extends the basic agent with plan-aware state tracking and budget control.
 */
export interface ToolLoopConfig {
  /** Plan steps from the planner (optional, enables plan-aware rounds). */
  readonly planSteps?: readonly PlanStep[];
  /** Verification strategy from the plan. */
  readonly verificationStrategy?: VerificationStrategy;
  /** Task category from the classifier. */
  readonly taskCategory?: string;
  /** Classification confidence (0–1). */
  readonly confidence?: number;
  /** Entities extracted from the task. */
  readonly entities?: readonly string[];
  /** Maximum total tool calls (overrides policy.maxToolCalls). */
  readonly maxToolCalls?: number;
  /** Maximum wall-clock time in milliseconds (0 = no limit). */
  readonly maxTimeMs?: number;
}

/**
 * A normalized tool result with quality signals (Phase 5, P5.3).
 */
export interface InspectedResult {
  /** The original tool result text. */
  readonly raw: string;
  /** Whether the result is empty or trivially small. */
  readonly empty: boolean;
  /** Whether the result indicates an error. */
  readonly error: boolean;
  /** Whether the result is informative (has meaningful content). */
  readonly informative: boolean;
  /** Recovery suggestions for empty/failed results. */
  readonly recoveryMenu: readonly string[];
  /** File paths extracted from the result (for state tracking). */
  readonly filePaths: readonly string[];
  /** Facts extracted from the result (for state tracking). */
  readonly facts: readonly string[];
}

/**
 * Inspect a tool result: normalize, flag empty/failed, extract metadata,
 * and generate recovery suggestions on failures (Phase 5, P5.3).
 *
 * This is a deterministic module — no AI, no IO.
 */
export function inspectResult(toolName: string, rawResult: string): InspectedResult {
  const trimmed = rawResult.trim();
  const empty = trimmed.length === 0 || trimmed === "{}" || trimmed === "[]";
  const error = trimmed.startsWith("{") && trimmed.includes('"error"');

  const recoveryMenu: string[] = [];
  if (empty) {
    recoveryMenu.push(`Tool "${toolName}" returned no results.`);
    if (toolName.startsWith("search_")) {
      recoveryMenu.push("Try a broader search query or use get_dependencies instead.");
    } else if (toolName === "read_file_range") {
      recoveryMenu.push("Check if the file path is correct and the range is valid.");
    } else {
      recoveryMenu.push("Try a different tool or refine your query.");
    }
  } else if (error) {
    recoveryMenu.push(`Tool "${toolName}" returned an error.`);
    recoveryMenu.push("Check the error message and adjust your approach.");
  }

  // Extract file paths (paths starting with / or ./ or ../)
  const filePaths: string[] = [];
  const pathPattern = /(?:^|\s)((?:\.{0,2}\/)[^\s,;)}\]]+)/g;
  let pathMatch = pathPattern.exec(trimmed);
  while (pathMatch !== null) {
    const p = pathMatch[1];
    if (p !== undefined && !filePaths.includes(p)) {
      filePaths.push(p);
    }
    pathMatch = pathPattern.exec(trimmed);
  }

  // Extract simple facts (lines that look like statements about code)
  const facts: string[] = [];
  if (!empty && !error) {
    // Take the first few meaningful lines as facts
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 5);
    for (const line of lines.slice(0, 3)) {
      const fact = line
        .trim()
        .replace(/^[-*]\s*/, "")
        .replace(/^"\s*/, "")
        .replace(/"\s*$/, "");
      if (fact.length > 5 && fact.length < 200) {
        facts.push(fact);
      }
    }
  }

  return {
    raw: rawResult,
    empty,
    error,
    informative: !empty && !error && trimmed.length >= MIN_INFORMATIVE_RESULT_CHARS,
    recoveryMenu,
    filePaths,
    facts,
  };
}

/**
 * Remembers prior search queries and their results so near-duplicate queries
 * return the cached results instead of re-executing (beta audit Fix 2).
 */
export class SearchMemory {
  private readonly queries = new Map<string, { results: unknown; timestamp: number }>();

  /** Record a query and its (already serialized) result. The key is stored raw. */
  public remember(query: string, results: unknown): void {
    this.queries.set(query, { results, timestamp: Date.now() });
  }

  /** Return the cached result for a similar prior query, if any. */
  public recall(query: string): unknown | undefined {
    for (const [key, value] of this.queries) {
      if (SearchMemory.isSimilarStatic(key, query)) return value.results;
    }
    return undefined;
  }

  /** Whether two queries are effectively the same (normalized equality or containment). */
  public isSimilar(q1: string, q2: string): boolean {
    return SearchMemory.isSimilarStatic(q1, q2);
  }

  private static isSimilarStatic(q1: string, q2: string): boolean {
    const a = SearchMemory.normalize(q1);
    const b = SearchMemory.normalize(q2);
    if (a === b) return true;
    // Very short queries (e.g. dependency node names "a" vs "b") must match
    // exactly — fuzzy matching would conflate distinct tiny keys.
    if (a.length <= 3 || b.length <= 3) return false;
    return a.includes(b) || b.includes(a) || SearchMemory.levenshteinDistance(a, b) <= 3;
  }

  /** Iterate cached entries: `[queryKey, results]` pairs, oldest first. */
  public *entries(): IterableIterator<[string, unknown]> {
    for (const [key, value] of this.queries) {
      yield [key, value.results];
    }
  }

  private static normalize(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");
  }

  private static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const cols = n + 1;
    const dp = new Array<number>((m + 1) * cols).fill(0);
    const idx = (i: number, j: number) => i * cols + j;
    for (let i = 0; i <= m; i++) dp[idx(i, 0)] = i;
    for (let j = 0; j <= n; j++) dp[idx(0, j)] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[idx(i, j)] = Math.min(
          dp[idx(i - 1, j)] + 1,
          dp[idx(i, j - 1)] + 1,
          dp[idx(i - 1, j - 1)] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[idx(m, n)];
  }
}

/** Extract the query-like argument used as the dedup key for a tool call. */
function queryKeyOf(args: Record<string, unknown>): string {
  const query = args["query"] ?? args["node"] ?? args["path"] ?? args["target"] ?? "";
  return String(query);
}

/**
 * Strip MCP server prefixes so policy limits and dedup keys match the
 * canonical tool names. opencode (and other hosts) expose MCP tools as
 * `<server>_<tool>` — e.g. `codeatlas_search_symbols`.
 */
function coreToolName(name: string): string {
  return name.replace(/^codeatlas_/, "");
}

/** Rough token estimate for a string (~4 chars/token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function traceMessage(traces: ChatAgentMessageTrace[], entry: ChatAgentMessageTrace): void {
  traces.push(entry);
}

/**
 * Build the objective restatement for the current round based on plan steps.
 *
 * Maps the current round to a plan step (1:1) and generates a focused
 * objective message for the model.
 */
function buildObjectiveRestatement(
  round: number,
  planSteps: readonly PlanStep[],
): string | undefined {
  if (planSteps.length === 0) return undefined;
  const stepIndex = Math.min(round, planSteps.length - 1);
  const step = planSteps[stepIndex];
  if (step === undefined) return undefined;
  return `[Round ${round + 1} objective] Step ${step.order}: ${step.action} (targets: ${step.targetFiles.join(", ") || "none"})`;
}

/**
 * A chat agent that wraps a `ProviderPort` and runs a bounded tool loop.
 *
 * When the model responds with `tool_calls`, this agent executes them against
 * the injected `ContextToolSource`, feeds the results back as `role: "tool"`
 * messages, and re-calls the provider. The loop terminates when:
 * - The model responds without tool calls (final answer).
 * - `MAX_TOOL_ROUNDS` is reached (returns the last content with a note).
 * - An unknown tool is called (returns an error result to the model).
 * - Global budget (maxToolCalls or maxTimeMs) is exhausted.
 *
 * Phase 5 adds:
 * - Per-step rounds with plan-aware objective restatement (P5.2)
 * - AgentState tracking across rounds (P5.1)
 * - ResultInspector for quality signals and recovery menus (P5.3)
 * - Global budget + stop-reason on every result (P5.4)
 */
export class ToolUsingChatAgent implements ChatAgentPort {
  public readonly providers: readonly string[];
  private readonly provider: ProviderPort;
  private readonly toolSource: ContextToolSource;
  private readonly maxRounds: number;
  private readonly policy: ToolCallPolicy | undefined;
  private readonly loopConfig: ToolLoopConfig;
  /** Deduplication memory for repeated/near-duplicate queries (audit Fix 2). */
  private readonly searchMemory = new SearchMemory();
  /** Executed-call count per tool name, for per-tool limits (audit Fix 5). */
  private readonly perToolCounts = new Map<string, number>();

  public constructor(
    provider: ProviderPort,
    toolSource: ContextToolSource,
    providers: readonly string[] = ["ollama"],
    maxRounds: number = MAX_TOOL_ROUNDS,
    policy?: ToolCallPolicy,
    loopConfig?: ToolLoopConfig,
  ) {
    this.providers = providers;
    this.provider = provider;
    this.toolSource = toolSource;
    this.maxRounds = maxRounds;
    this.policy = policy;
    this.loopConfig = loopConfig ?? {};
  }

  public handles(provider: string): boolean {
    return this.providers.some((p) => p === provider);
  }

  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    if (!this.handles(request.provider)) {
      return fail(new Error(`Provider "${request.provider}" is not handled by this runner`));
    }

    const tools = this.offeredTools();
    const startMs = Date.now();
    const messages =
      request.messages !== undefined ? [...request.messages] : buildInitialMessages(request);
    // Inject agent guidance into the first user message (beta audit Fix 1)
    if (messages.length > 0 && messages[0].role === "user") {
      messages[0] = {
        ...messages[0],
        content: `${CONTEXT_GUIDANCE}\n\n${messages[0].content}`,
      };
    }
    const toolDefs = tools.length > 0 ? tools : undefined;
    const maxResultChars = this.policy?.maxResultChars ?? MAX_TOOL_RESULT_CHARS;
    const toolSchemaTokens = toolDefs !== undefined ? estimateTokens(JSON.stringify(toolDefs)) : 0;
    const callTraces: ChatAgentCallTrace[] = [];
    const messageTraces: ChatAgentMessageTrace[] = [];

    if (request.prompt !== "") {
      traceMessage(messageTraces, {
        role: "user",
        source: "user-prompt",
        firstCallIndex: 1,
        contentChars: request.prompt.length,
        estimatedTokens: estimateTokens(request.prompt),
      });
    }
    if (messages.length > 0 && messages[0].role === "user") {
      traceMessage(messageTraces, {
        role: "user",
        source: "context-guidance",
        firstCallIndex: 1,
        contentChars: CONTEXT_GUIDANCE.length,
        estimatedTokens: estimateTokens(CONTEXT_GUIDANCE),
      });
    }

    // Phase 5: Initialize agent state (P5.1)
    let state = createAgentState(request.prompt);
    if (this.loopConfig.planSteps !== undefined) {
      state = setPlan(state, {
        steps: this.loopConfig.planSteps,
        impactSet: this.loopConfig.planSteps.flatMap((s) => [...s.targetFiles]),
        unknowns: [],
        verificationStrategy: this.loopConfig.verificationStrategy ?? "none",
      });
    }
    if (this.loopConfig.taskCategory !== undefined) {
      state = setClassification(state, {
        category: this.loopConfig.taskCategory,
        confidence: this.loopConfig.confidence ?? 0,
        entities: this.loopConfig.entities ?? [],
      });
    }

    let lastContent = "";
    let lastModel: string | undefined;
    let lastUsage: ChatAgentResult["tokenUsage"] = undefined;
    let executedCalls = 0;
    const deniedToolCalls: string[] = [];
    let stopReason: StopReason = "final-answer";
    let dedupeHitCount = 0;
    let cumulativeInputTokens = 0;
    let cumulativeOutputTokens = 0;

    // Phase 5: Global budget (P5.4)
    const effectiveMaxToolCalls = this.loopConfig.maxToolCalls ?? this.policy?.maxToolCalls;
    const maxTimeMs = this.loopConfig.maxTimeMs ?? 0;

    // Progress tracking for diminishing-returns detection (beta audit Fix 3):
    // tracks *unique new* content per round so repeated identical results
    // register as no growth.
    let previousRoundTokens = 0;
    let consecutiveLowGrowthRounds = 0;
    const seenResults = new Set<string>();

    for (let round = 0; round < this.maxRounds; round++) {
      const callIndex = callTraces.length + 1;
      // Phase 5: Check global budget (P5.4)
      if (maxTimeMs > 0 && Date.now() - startMs >= maxTimeMs) {
        stopReason = "budget-exhausted";
        break;
      }
      if (effectiveMaxToolCalls !== undefined && executedCalls >= effectiveMaxToolCalls) {
        stopReason = "budget-exhausted";
        break;
      }

      // Phase 5: Inject state summary + objective restatement (P5.2)
      const stateSummary = renderStateSummary(state);
      const objective = buildObjectiveRestatement(round, this.loopConfig.planSteps ?? []);
      if (round > 0 || objective !== undefined) {
        const stateMsg: string[] = [];
        if (objective !== undefined) {
          stateMsg.push(objective);
        }
        stateMsg.push(stateSummary);
        const stateContent = stateMsg.join("\n\n");
        messages.push({ role: "system", content: stateContent });
        traceMessage(messageTraces, {
          role: "system",
          source: "state-summary",
          firstCallIndex: callIndex,
          contentChars: stateContent.length,
          estimatedTokens: estimateTokens(stateContent),
        });
      }

      const estimatedInputTokens =
        messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + toolSchemaTokens;

      const roundStartMs = performance.now();
      const result = await this.provider.complete({
        provider: request.provider,
        ...(request.model !== undefined ? { model: request.model } : {}),
        prompt: request.prompt,
        ...(toolDefs !== undefined ? { tools: toolDefs, toolChoice: "auto" } : {}),
        ...(messages.length > 0 ? { messages } : {}),
      });

      if (!result.ok) {
        state = setStopReason(state, "error");
        return fail(
          new Error(`Provider "${request.provider}" request failed: ${result.error.message}`),
        );
      }

      const response = result.value;
      lastContent = typeof response.content === "string" ? response.content : "";
      lastModel = response.model ?? undefined;
      lastUsage = response.usage ?? undefined;
      // Accumulate provider-reported tokens across rounds for correct totals.
      if (response.usage?.inputTokens !== undefined) {
        cumulativeInputTokens += response.usage.inputTokens;
      }
      if (response.usage?.outputTokens !== undefined) {
        cumulativeOutputTokens += response.usage.outputTokens;
      }
      callTraces.push({
        callIndex,
        round,
        messageCount: messages.length,
        estimatedInputTokens,
        toolSchemaTokens,
        roundDurationMs: Math.round(performance.now() - roundStartMs),
        ...(response.usage?.inputTokens !== undefined
          ? { reportedInputTokens: response.usage.inputTokens }
          : {}),
        ...(response.usage?.outputTokens !== undefined
          ? { reportedOutputTokens: response.usage.outputTokens }
          : {}),
        ...(response.usage?.totalTokens !== undefined
          ? { reportedTotalTokens: response.usage.totalTokens }
          : {}),
        cumulativeInputTokens,
        cumulativeOutputTokens,
      });

      const toolCalls = response.toolCalls;

      // No tool calls — final answer
      if (toolCalls === undefined || toolCalls.length === 0) {
        stopReason = "final-answer";
        state = setStopReason(state, stopReason);
        return ok({
          model: lastModel,
          content: lastContent,
          durationMs: Date.now() - startMs,
          tokenUsage: lastUsage,
          messages: [...messages],
          executionTrace: { calls: callTraces, messages: messageTraces },
          ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
          stopReason,
          roundCount: round + 1,
          dedupeHitCount,
          agentState: state,
        });
      }

      // Execute tool calls and build new messages
      messages.push({
        role: "assistant",
        content: lastContent,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: tc.function,
              })),
            }
          : {}),
      });
      traceMessage(messageTraces, {
        role: "assistant",
        source: "assistant-tool-call",
        firstCallIndex: callIndex + 1,
        contentChars: lastContent.length + estimateTokens(JSON.stringify(toolCalls)),
        estimatedTokens: estimateTokens(lastContent) + estimateTokens(JSON.stringify(toolCalls)),
      });

      let roundResultChars = 0;

      for (const toolCall of toolCalls) {
        // Parse arguments once (used for dedup and for error reporting).
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          // Leave args empty; executeToolCall reports the malformed JSON.
        }
        const coreName = coreToolName(toolCall.function.name);
        const isSearchLike = coreName.startsWith("search_") || coreName === "get_dependencies";

        // Repeated-query detection (beta audit Fix 2): serve cached results
        // for near-duplicate queries instead of re-executing. Counts toward
        // the executed-call budget but costs no provider round.
        if (isSearchLike && Object.keys(args).length > 0) {
          const cached = this.findSimilarQuery(args, coreName);
          if (cached !== undefined) {
            executedCalls += 1;
            dedupeHitCount += 1;
            this.perToolCounts.set(coreName, (this.perToolCounts.get(coreName) ?? 0) + 1);
            const cachedText = JSON.stringify(cached);
            if (!seenResults.has(cachedText)) {
              seenResults.add(cachedText);
              roundResultChars += estimateTokens(cachedText);
            }
            // Phase 5: Track in state (P5.2)
            state = recordToolUsage(state, {
              name: coreName,
              queryKey: queryKeyOf(args),
              round,
              cached: true,
              outputChars: cachedText.length,
            });
            messages.push({
              role: "tool",
              content: JSON.stringify({
                ...(typeof cached === "object" && cached !== null ? cached : { result: cached }),
                _cached: true,
                _message: "Similar query already executed. Results cached from prior call.",
              }),
              tool_call_id: toolCall.id,
            });
            const cachedContent = JSON.stringify({
              ...(typeof cached === "object" && cached !== null ? cached : { result: cached }),
              _cached: true,
              _message: "Similar query already executed. Results cached from prior call.",
            });
            traceMessage(messageTraces, {
              role: "tool",
              source: "tool-result",
              firstCallIndex: callIndex + 1,
              contentChars: cachedContent.length,
              estimatedTokens: estimateTokens(cachedContent),
              toolName: coreName,
            });
            continue;
          }
        }

        const decision = this.decide(toolCall, executedCalls);
        if (!decision.allowed) {
          deniedToolCalls.push(toolCall.id);
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: decision.reason }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const toolResult = await executeToolCall(this.toolSource, toolCall, maxResultChars);
        executedCalls += 1;
        if (!seenResults.has(toolResult)) {
          seenResults.add(toolResult);
          roundResultChars += estimateTokens(toolResult);
        }

        // Phase 5: Inspect result + update state (P5.3)
        const inspected = inspectResult(coreName, toolResult);
        state = recordToolUsage(state, {
          name: coreName,
          queryKey: queryKeyOf(args),
          round,
          cached: false,
          outputChars: toolResult.length,
        });
        if (inspected.filePaths.length > 0) {
          for (const fp of inspected.filePaths) {
            state = recordFileInspected(state, fp);
          }
        }
        if (inspected.facts.length > 0) {
          state = addKnownFacts(state, inspected.facts);
        }
        // Inject recovery menu for empty/error results
        if (inspected.recoveryMenu.length > 0) {
          const recoveryMsg = inspected.recoveryMenu.join(" ");
          messages.push({
            role: "tool",
            content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });
          traceMessage(messageTraces, {
            role: "tool",
            source: "tool-result",
            firstCallIndex: callIndex + 1,
            contentChars: toolResult.length,
            estimatedTokens: estimateTokens(toolResult),
            toolName: coreName,
          });
          messages.push({
            role: "system",
            content: `[ResultInspector] ${recoveryMsg}`,
          });
          traceMessage(messageTraces, {
            role: "system",
            source: "recovery-note",
            firstCallIndex: callIndex + 1,
            contentChars: `[ResultInspector] ${recoveryMsg}`.length,
            estimatedTokens: estimateTokens(`[ResultInspector] ${recoveryMsg}`),
          });
        } else {
          messages.push({
            role: "tool",
            content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });
          traceMessage(messageTraces, {
            role: "tool",
            source: "tool-result",
            firstCallIndex: callIndex + 1,
            contentChars: toolResult.length,
            estimatedTokens: estimateTokens(toolResult),
            toolName: coreName,
          });
        }

        if (isSearchLike && Object.keys(args).length > 0) {
          // Remember the parsed result value so cached replays serialize
          // identically to the original (keeps progress detection honest).
          let value: unknown = toolResult;
          try {
            value = JSON.parse(toolResult) as unknown;
          } catch {
            // Keep the raw string when the result is not JSON.
          }
          this.searchMemory.remember(`${coreName}:${queryKeyOf(args)}`, value);
        }
      }

      // Phase 5: Advance round (P5.1)
      state = nextRound(state);

      // Progress detection (beta audit Fix 3): if this round added little new
      // content relative to the biggest round so far, nudge the model toward
      // answering with what it has.
      if (
        previousRoundTokens > 0 &&
        roundResultChars < previousRoundTokens * LOW_GROWTH_THRESHOLD
      ) {
        consecutiveLowGrowthRounds += 1;
        if (consecutiveLowGrowthRounds >= LOW_GROWTH_ROUNDS) {
          stopReason = "low-growth";
          const progressMessage = `[Progress: After ${round + 1} rounds, you've gathered information but recent searches added little new data. Consider answering with what you have. You can continue searching or provide your answer now.]`;
          messages.push({
            role: "system",
            content: progressMessage,
          });
          traceMessage(messageTraces, {
            role: "system",
            source: "progress-note",
            firstCallIndex: callIndex + 1,
            contentChars: progressMessage.length,
            estimatedTokens: estimateTokens(progressMessage),
          });
        }
      } else {
        consecutiveLowGrowthRounds = 0;
      }
      previousRoundTokens = Math.max(previousRoundTokens, roundResultChars);
    }

    // Max rounds reached — return last content with a truncation note.
    // "low-growth" is a hint to the model during the loop; the actual
    // termination cause is always max-rounds when we fall out of the loop.
    if (stopReason !== "budget-exhausted") {
      stopReason = "max-rounds";
    }
    state = setStopReason(state, stopReason);
    const note = `\n\n[Tool loop ended after ${this.maxRounds} rounds — ${stopReason}.]`;
    return ok({
      model: lastModel,
      content: lastContent + note,
      durationMs: Date.now() - startMs,
      tokenUsage: lastUsage,
      messages: [...messages],
      executionTrace: { calls: callTraces, messages: messageTraces },
      ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
      stopReason,
      roundCount: callTraces.length > 0 ? callTraces[callTraces.length - 1].round + 1 : 0,
      dedupeHitCount,
      agentState: state,
    });
  }

  /** Tool definitions offered to the model after applying the policy. */
  private offeredTools(): readonly ToolDefinition[] {
    const all = this.toolSource.listTools();
    if (this.policy === undefined) {
      return all;
    }
    return all.filter(
      (tool) => evaluateToolCallPolicy(this.policy, coreToolName(tool.function.name)).allowed,
    );
  }

  /** Decide whether one requested call may execute (name allow/deny + limits + budget). */
  private decide(toolCall: ToolCall, executedCalls: number): { allowed: boolean; reason?: string } {
    // Global budget first: it is the stricter gate (audit Fix 5).
    const max = this.policy?.maxToolCalls;
    if (max !== undefined && executedCalls >= max) {
      return {
        allowed: false,
        reason: `Tool call budget exhausted (${max} call${max === 1 ? "" : "s"} per run)`,
      };
    }
    // Track per-tool usage (keyed by the canonical name so MCP-prefixed names
    // share the same limit), then evaluate allow/deny + per-tool limits.
    // The count is evaluated *before* incrementing so the limit-th call is the
    // last allowed one; only allowed calls consume quota.
    const name = coreToolName(toolCall.function.name);
    const decision = evaluateToolCallPolicy(
      this.policy,
      name,
      Object.fromEntries(this.perToolCounts),
    );
    if (decision.allowed) {
      this.perToolCounts.set(name, (this.perToolCounts.get(name) ?? 0) + 1);
    }
    return decision;
  }

  /** Find a cached result whose query is similar to the requested one (Fix 2). */
  private findSimilarQuery(args: Record<string, unknown>, toolName: string): unknown | undefined {
    const query = queryKeyOf(args);
    if (query === "") return undefined;
    for (const [key, value] of this.searchMemory.entries()) {
      const sep = key.indexOf(":");
      if (sep < 0) continue;
      const cachedTool = key.slice(0, sep);
      const cachedQuery = key.slice(sep + 1);
      if (cachedTool === toolName && this.searchMemory.isSimilar(query, cachedQuery)) {
        return value;
      }
    }
    return undefined;
  }
}

/** Build the initial messages array from a ChatAgentRequest. */
function buildInitialMessages(request: ChatAgentRequest): ProviderMessage[] {
  const messages: ProviderMessage[] = [];
  if (request.prompt !== "") {
    messages.push({ role: "user", content: request.prompt });
  }
  return messages;
}

/** Execute a single tool call against the ContextToolSource. */
async function executeToolCall(
  toolSource: ContextToolSource,
  toolCall: ToolCall,
  maxResultChars: number,
): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return JSON.stringify({
      error: `Invalid JSON in tool arguments: ${toolCall.function.arguments}`,
    });
  }

  const result = await toolSource.execute(name, args);
  if (!result.ok) {
    return JSON.stringify({ error: result.error.message });
  }

  const value = result.value;
  const text = typeof value === "string" ? value : JSON.stringify(value);

  // Truncate oversized results
  if (text.length > maxResultChars) {
    return `${text.slice(0, maxResultChars)}\n… [truncated]`;
  }
  return text;
}
