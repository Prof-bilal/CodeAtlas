import { CacheService } from "@atlas/cache";
import type { ProviderPort, ProviderRequest, SourceFile, TokenUsage } from "@atlas/core";
import { HashService } from "@atlas/hashing";
import type { FilePath } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { SummaryParseError } from "../src/json";
import { SummaryService } from "../src/summary.service";

/** A scriptable provider that returns canned JSON content and records calls. */
class FakeProvider implements ProviderPort {
  public calls: ProviderRequest[] = [];
  public content = JSON.stringify({ overview: "A demo module", keyPoints: ["key point"] });
  public usage: TokenUsage | null = { inputTokens: 5, outputTokens: 2, totalTokens: 7 };
  /** Call numbers (1-based) that should fail; each consumes a failure. */
  public failOnCall = new Set<number>();

  public async complete(request: ProviderRequest) {
    this.calls.push(request);
    if (this.failOnCall.has(this.calls.length)) {
      return fail(new SummaryParseError("per-file failure"));
    }
    return ok({
      provider: "claude",
      model: "fake-model",
      content: this.content,
      ...(this.usage !== null ? { usage: this.usage } : {}),
    });
  }
}

const file = (path: string, content: string): SourceFile => ({
  path: path as FilePath,
  language: "typescript",
  content,
});

function buildService(provider: ProviderPort) {
  return new SummaryService({ provider, cache: new CacheService(), hash: new HashService() });
}

describe("SummaryService", () => {
  it("generates a structured file summary and caches it", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);

    const first = await service.summarizeFile(file("/a.ts", "export const a = 1;"));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.kind).toBe("file");
    expect(first.value.content.overview).toBe("A demo module");
    expect(first.value.content.keyPoints).toEqual(["key point"]);
    expect(first.value.metadata.cacheHit).toBe(false);
    expect(first.value.metadata.totalTokens).toBe(7);
    expect(first.value.metadata.inputTokens).toBe(5);
    expect(first.value.metadata.provider).toBe("claude");
    expect(provider.calls.length).toBe(1);

    // Same content: served from cache, no second model call.
    const second = await service.summarizeFile(file("/a.ts", "export const a = 1;"));
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.value.metadata.cacheHit).toBe(true);
    expect(provider.calls.length).toBe(1);
  });

  it("regenerates when file content changes", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);
    await service.summarizeFile(file("/a.ts", "export const a = 1;"));
    await service.summarizeFile(file("/a.ts", "export const a = 2;"));
    expect(provider.calls.length).toBe(2);
  });

  it("uses a custom prompt template and records it in metadata", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);
    const custom = "Describe {path} in {language}.";
    const result = await service.summarizeFile(file("/a.ts", "x"), { prompt: custom });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(provider.calls[0].prompt).toContain("Describe /a.ts in typescript.");
    expect(result.value.metadata.prompt).toBe(custom);
  });

  it("fails when the model returns invalid JSON", async () => {
    const provider = new FakeProvider();
    provider.content = "not json at all";
    const service = buildService(provider);
    const result = await service.summarizeFile(file("/b.ts", "y"));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(SummaryParseError);
  });

  it("summarizeFolder reuses unchanged file summaries and regenerates only changes", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);
    const files = [
      file("/src/a.ts", "export const a = 1;"),
      file("/src/b.ts", "export const b = 2;"),
    ];

    const scope = await service.summarizeFolder("/src", files);
    expect(scope.ok).toBe(true);
    if (!scope.ok) {
      return;
    }
    expect(scope.value.kind).toBe("folder");
    expect(scope.value.target).toBe("/src");
    expect(provider.calls.length).toBe(3); // two per-file + one scope

    // Unchanged: everything served from cache.
    await service.summarizeFolder("/src", files);
    expect(provider.calls.length).toBe(3);

    // One file changed: only it and the scope regenerate.
    const changed = [files[0], file("/src/b.ts", "export const b = 999;")];
    await service.summarizeFolder("/src", changed);
    expect(provider.calls.length).toBe(5);
  });

  it("summarizeProject returns a project summary", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);
    const result = await service.summarizeProject([file("/p/a.ts", "export const a = 1;")]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.kind).toBe("project");
  });

  it("respects the force option to bypass the cache", async () => {
    const provider = new FakeProvider();
    const service = buildService(provider);
    await service.summarizeFile(file("/a.ts", "export const a = 1;"));
    await service.summarizeFile(file("/a.ts", "export const a = 1;"), { force: true });
    expect(provider.calls.length).toBe(2);
  });

  it("summarizeFolder skips a failed per-file summary instead of aborting the scope", async () => {
    // Fail the first per-file call; the second and the scope call succeed.
    const provider = new FakeProvider();
    provider.failOnCall.add(1);
    const service = buildService(provider);
    const files = [
      file("/src/a.ts", "export const a = 1;"),
      file("/src/b.ts", "export const b = 2;"),
    ];

    const scope = await service.summarizeFolder("/src", files);
    expect(scope.ok).toBe(true);
    if (!scope.ok) {
      return;
    }
    expect(scope.value.kind).toBe("folder");
    expect(scope.value.content.overview).toBe("A demo module");
    // Three calls total: the failed per-file, the successful per-file, and
    // the scope summary (which still ran despite the earlier failure).
    expect(provider.calls.length).toBe(3);
  });

  it("summarizeFolder returns a failure when every per-file summary fails", async () => {
    const provider = new FakeProvider();
    provider.failOnCall.add(1);
    provider.failOnCall.add(2);
    const service = buildService(provider);
    const files = [
      file("/src/a.ts", "export const a = 1;"),
      file("/src/b.ts", "export const b = 2;"),
    ];

    const scope = await service.summarizeFolder("/src", files);
    expect(scope.ok).toBe(false);
    if (scope.ok) {
      return;
    }
    expect(scope.error).toBeInstanceOf(SummaryParseError);
  });
});
