import { CacheService } from "@atlas/cache";
import type {
  ProviderPort,
  ProviderRequest,
  SummaryContent,
  SummaryMetadata,
  UsagePort,
} from "@atlas/core";
import { HashService } from "@atlas/hashing";
import type { CacheKey, Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import {
  SYSTEM_JSON_INSTRUCTION,
  parseSummaryContent,
  render,
  truncateContent,
} from "@atlas/summary";
import { withUsageTracking } from "@atlas/usage";
import { createProviderService } from "../providers/index";

/** Default prompt: turn the assembled context package into a task briefing. */
export const BRIEFING_PROMPT_TEMPLATE = `You are given the repository context CodeAtlas assembled for this task:

Task: {target}

Context:
{content}

Write a concise briefing for an engineer starting this task, based only on the
context above. Do not invent facts that are not present.

Return a JSON object with exactly these keys:
- "overview": string — what the assembled context covers and the most relevant parts for the task
- "keyPoints": array of strings — concrete, task-relevant takeaways (file paths, symbols, risks, gaps)`;

/** A briefing request against the provider. */
export interface BriefingRequest {
  /** Label describing what is being summarized (e.g. the task). */
  readonly target: string;
  /** The text to summarize (the rendered context package). */
  readonly content: string;
  /** Model id override for the provider. */
  readonly model?: string;
  /** Custom prompt template with `{target}` / `{content}` placeholders. */
  readonly prompt?: string;
}

/** The structured AI output plus its generation metadata. */
export interface BriefingResponse {
  readonly content: SummaryContent;
  readonly metadata: SummaryMetadata;
}

/** Generates structured AI briefings over arbitrary text. */
export interface BriefingPort {
  generate(input: BriefingRequest): Promise<Result<BriefingResponse>>;
}

/** Options for constructing a {@link BriefingService}. */
export interface BriefingServiceOptions {
  readonly provider: ProviderPort;
  readonly cache: CacheService;
  readonly hash: HashService;
}

/**
 * The provider-backed {@link BriefingPort} default. Mirrors `SummaryService`:
 * requests are cached by the content hash of what is summarized, so unchanged
 * context packages are never re-sent to a model, and every call returns a
 * `Result` so missing providers fail cleanly instead of throwing.
 */
export class BriefingService implements BriefingPort {
  private readonly provider: ProviderPort;
  private readonly cache: CacheService;
  private readonly hash: HashService;

  public constructor(options: BriefingServiceOptions) {
    this.provider = options.provider;
    this.cache = options.cache;
    this.hash = options.hash;
  }

  public async generate(request: BriefingRequest): Promise<Result<BriefingResponse>> {
    const content = truncateContent(request.content);
    const key = `briefing:${this.hash.hashContent(`${request.target}|${content}`)}` as CacheKey;
    const cached = await this.cache.get<BriefingResponse>(key);
    if (cached.ok && cached.value !== undefined) {
      return ok({
        content: cached.value.content,
        metadata: { ...cached.value.metadata, cacheHit: true },
      });
    }

    const prompt = render(request.prompt ?? BRIEFING_PROMPT_TEMPLATE, {
      target: request.target,
      content,
    });
    const providerRequest: ProviderRequest = {
      prompt,
      system: SYSTEM_JSON_INSTRUCTION,
      json: true,
      ...(request.model !== undefined ? { model: request.model } : {}),
    };
    const response = await this.provider.complete(providerRequest);
    if (!response.ok) {
      return fail(response.error);
    }
    const parsed = parseSummaryContent(response.value.content);
    if (!parsed.ok) {
      return parsed;
    }
    const usage = response.value.usage;
    const metadata: SummaryMetadata = {
      generatedAt: new Date().toISOString(),
      provider: response.value.provider,
      model: response.value.model,
      prompt: request.prompt ?? null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
    };
    const briefing: BriefingResponse = { content: parsed.value, metadata };
    await this.cache.set(key, { content: parsed.value, metadata });
    return ok(briefing);
  }
}

/** Options for {@link createBriefingPort}. */
export interface CreateBriefingPortOptions {
  /** Provider to call (defaults to the environment + user settings). */
  readonly provider?: ProviderPort;
  /** Cache for briefings (defaults to a fresh in-memory cache). */
  readonly cache?: CacheService;
  /** Content hasher (defaults to the shared hashing service). */
  readonly hash?: HashService;
  /** Optional usage port; provider calls are recorded with actual tokens. */
  readonly usage?: UsagePort;
}

/** Build the default provider-backed {@link BriefingPort}. */
export function createBriefingPort(options: CreateBriefingPortOptions = {}): BriefingPort {
  return new BriefingService({
    provider:
      options.provider ??
      (options.usage === undefined
        ? createProviderService()
        : withUsageTracking(createProviderService(), options.usage)),
    cache: options.cache ?? new CacheService(),
    hash: options.hash ?? new HashService(),
  });
}
