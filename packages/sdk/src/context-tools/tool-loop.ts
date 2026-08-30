import type {
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderMessage,
  ProviderPort,
  ToolCall,
  ToolDefinition,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
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

/**
 * A chat agent that wraps a `ProviderPort` and runs a bounded tool loop.
 *
 * When the model responds with `tool_calls`, this agent executes them against
 * the injected `ContextToolSource`, feeds the results back as `role: "tool"`
 * messages, and re-calls the provider. The loop terminates when:
 * - The model responds without tool calls (final answer).
 * - `MAX_TOOL_ROUNDS` is reached (returns the last content with a note).
 * - An unknown tool is called (returns an error result to the model).
 *
 * An optional `ToolCallPolicy` restricts which tools are offered and executed
 * (advisory security surface): denied calls receive an error result the model
 * can react to, and the denied call ids are surfaced on the result.
 */
export class ToolUsingChatAgent implements ChatAgentPort {
  public readonly providers: readonly string[];
  private readonly provider: ProviderPort;
  private readonly toolSource: ContextToolSource;
  private readonly maxRounds: number;
  private readonly policy: ToolCallPolicy | undefined;
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
  ) {
    this.providers = providers;
    this.provider = provider;
    this.toolSource = toolSource;
    this.maxRounds = maxRounds;
    this.policy = policy;
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

    let lastContent = "";
    let lastModel: string | undefined;
    let lastUsage: ChatAgentResult["tokenUsage"] = undefined;
    let executedCalls = 0;
    const deniedToolCalls: string[] = [];

    // Progress tracking for diminishing-returns detection (beta audit Fix 3):
    // tracks *unique new* content per round so repeated identical results
    // register as no growth.
    let previousRoundTokens = 0;
    let consecutiveLowGrowthRounds = 0;
    const seenResults = new Set<string>();

    for (let round = 0; round < this.maxRounds; round++) {
      const result = await this.provider.complete({
        provider: request.provider,
        prompt: request.prompt,
        ...(toolDefs !== undefined ? { tools: toolDefs, toolChoice: "auto" } : {}),
        ...(messages.length > 0 ? { messages } : {}),
      });

      if (!result.ok) {
        return fail(
          new Error(`Provider "${request.provider}" request failed: ${result.error.message}`),
        );
      }

      const response = result.value;
      lastContent = typeof response.content === "string" ? response.content : "";
      lastModel = response.model ?? undefined;
      lastUsage = response.usage ?? undefined;

      const toolCalls = response.toolCalls;

      // No tool calls — final answer
      if (toolCalls === undefined || toolCalls.length === 0) {
        return ok({
          model: lastModel,
          content: lastContent,
          durationMs: Date.now() - startMs,
          tokenUsage: lastUsage,
          messages: [...messages],
          ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
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
            this.perToolCounts.set(coreName, (this.perToolCounts.get(coreName) ?? 0) + 1);
            const cachedText = JSON.stringify(cached);
            if (!seenResults.has(cachedText)) {
              seenResults.add(cachedText);
              roundResultChars += estimateTokens(cachedText);
            }
            messages.push({
              role: "tool",
              content: JSON.stringify({
                ...(typeof cached === "object" && cached !== null ? cached : { result: cached }),
                _cached: true,
                _message: "Similar query already executed. Results cached from prior call.",
              }),
              tool_call_id: toolCall.id,
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
        messages.push({
          role: "tool",
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
        });
      }

      // Progress detection (beta audit Fix 3): if this round added little new
      // content relative to the biggest round so far, nudge the model toward
      // answering with what it has.
      if (
        previousRoundTokens > 0 &&
        roundResultChars < previousRoundTokens * LOW_GROWTH_THRESHOLD
      ) {
        consecutiveLowGrowthRounds += 1;
        if (consecutiveLowGrowthRounds >= LOW_GROWTH_ROUNDS) {
          messages.push({
            role: "system",
            content: `[Progress: After ${round + 1} rounds, you've gathered information but recent searches added little new data. Consider answering with what you have. You can continue searching or provide your answer now.]`,
          });
        }
      } else {
        consecutiveLowGrowthRounds = 0;
      }
      previousRoundTokens = Math.max(previousRoundTokens, roundResultChars);
    }

    // Max rounds reached — return last content with a truncation note
    const note = `\n\n[Tool loop ended after ${this.maxRounds} rounds — maximum iterations reached.]`;
    return ok({
      model: lastModel,
      content: lastContent + note,
      durationMs: Date.now() - startMs,
      tokenUsage: lastUsage,
      messages: [...messages],
      ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
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
