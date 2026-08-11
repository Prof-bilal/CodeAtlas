import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderPort } from "@atlas/core";
import { ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { StaticPricingSource, UsageService, UsageStore, withUsageTracking } from "../src";

function serviceFor(filePath: string): UsageService {
  return new UsageService({
    store: new UsageStore({ filePath }),
    pricing: new StaticPricingSource(),
  });
}

describe("integration: collector → store → service", () => {
  it("round-trips a provider call into a persistent file-backed store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-usage-"));
    try {
      const dbPath = join(dir, "usage.db");
      const usage = serviceFor(dbPath);
      const provider: ProviderPort = {
        async complete() {
          return ok({
            provider: "claude",
            model: "claude-sonnet-5",
            content: "ok",
            usage: { inputTokens: 1_000, outputTokens: 2_000, totalTokens: 3_000 },
          });
        },
      };
      const wrapped = withUsageTracking(provider, usage, { sessionId: "s-1" });
      const result = await wrapped.complete({ prompt: "do a thing" });
      expect(result.ok).toBe(true);
      usage.close();

      // Reopen the same file and read the persisted record back.
      const reopened = serviceFor(dbPath);
      const records = reopened.listUsage();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        provider: "claude",
        sessionId: "s-1",
      });
      expect(records[0].tokens.total).toEqual({ source: "actual", value: 3_000 });
      expect(records[0].cost.amount.source).toBe("estimated");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a provider with unknown tokens yields unknown, not a guess", async () => {
    const usage = serviceFor(":memory:");
    const provider: ProviderPort = {
      async complete() {
        return ok({ provider: "openai", model: "gpt-4o", content: "no usage data" });
      },
    };
    const wrapped = withUsageTracking(provider, usage);
    await wrapped.complete({ prompt: "hi" });

    const record = usage.listUsage()[0];
    expect(record.tokens.input.source).toBe("unknown");
    expect(record.tokens.total.value).toBeNull();
    expect(record.cost.amount.source).toBe("unknown");
    expect(record.cost.amount.value).toBeNull();
  });

  it("never persists prompts, API keys, or environment values", async () => {
    const usage = serviceFor(":memory:");
    const secretKey = "sk-super-secret-123456";
    const prompt = "The vault combination is 4 8 15 16 23 42";
    const provider: ProviderPort = {
      async complete() {
        return ok({
          provider: "claude",
          model: "claude-sonnet-5",
          content: "done",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        });
      },
    };
    const wrapped = withUsageTracking(provider, usage, { taskRef: "task-1 (hashed)" });
    await wrapped.complete({ prompt });

    const records = usage.listUsage();
    expect(records).toHaveLength(1);
    // Only the already-anonymized reference is stored.
    expect(records[0].taskRef).toBe("task-1 (hashed)");

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(prompt);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain("4 8 15 16 23 42");
  });
});
