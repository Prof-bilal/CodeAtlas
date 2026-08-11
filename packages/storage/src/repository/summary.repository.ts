import type { DatabaseSync } from "node:sqlite";
import type { Summary, SummaryKind } from "@atlas/core";
import { colBoolean, colNumber, colString, count, parseJsonArray, type Row } from "./row";

/** CRUD for the `Summaries` table, keyed by (kind, target). */
export class SummaryRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a summary by its (kind, target) natural key. */
  public upsert(summary: Summary): void {
    this.db
      .prepare(
        `INSERT INTO Summaries (
           kind, target, overview, key_points,
           provider, model, prompt,
           cache_hit, duration_ms, input_tokens, output_tokens, total_tokens, generated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind, target) DO UPDATE SET
           overview = excluded.overview,
           key_points = excluded.key_points,
           provider = excluded.provider,
           model = excluded.model,
           prompt = excluded.prompt,
           cache_hit = excluded.cache_hit,
           duration_ms = excluded.duration_ms,
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           total_tokens = excluded.total_tokens,
           generated_at = excluded.generated_at`,
      )
      .run(
        summary.kind,
        summary.target,
        summary.content.overview,
        JSON.stringify(summary.content.keyPoints),
        summary.metadata.provider,
        summary.metadata.model,
        summary.metadata.prompt,
        summary.metadata.cacheHit ? 1 : 0,
        summary.metadata.durationMs,
        summary.metadata.inputTokens,
        summary.metadata.outputTokens,
        summary.metadata.totalTokens,
        summary.metadata.generatedAt,
      );
  }

  public deleteByTarget(target: string): number {
    return count(this.db.prepare("DELETE FROM Summaries WHERE target = ?").run(target).changes);
  }

  public deleteByKey(kind: SummaryKind, target: string): number {
    return count(
      this.db.prepare("DELETE FROM Summaries WHERE kind = ? AND target = ?").run(kind, target)
        .changes,
    );
  }

  public all(): Summary[] {
    return (this.db.prepare("SELECT * FROM Summaries ORDER BY kind, target").all() as Row[]).map(
      summaryFromRow,
    );
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Summaries").run().changes);
  }
}

function summaryFromRow(row: Row): Summary {
  return {
    kind: colString(row, "kind") as SummaryKind,
    target: colString(row, "target") ?? "",
    content: {
      overview: colString(row, "overview") ?? "",
      keyPoints: parseJsonArray(colString(row, "key_points")),
    },
    metadata: {
      generatedAt: colString(row, "generated_at") ?? "",
      provider: colString(row, "provider") ?? "",
      model: colString(row, "model") ?? "",
      prompt: colString(row, "prompt"),
      cacheHit: colBoolean(row, "cache_hit"),
      durationMs: colNumber(row, "duration_ms"),
      inputTokens: colNumber(row, "input_tokens"),
      outputTokens: colNumber(row, "output_tokens"),
      totalTokens: colNumber(row, "total_tokens"),
    },
  };
}
