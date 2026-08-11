import type { DatabaseSync } from "node:sqlite";
import type { MeasuredQuantity, QuantitySource, UsageQuery, UsageRecord } from "@atlas/core";
import { colBoolean, colNumber, colString, count, type Row } from "./row";

/**
 * CRUD for the `UsageEvents` table. A usage record stores normalized token and
 * cost quantities with their tri-state provenance; raw task text, prompts, and
 * secrets are never written here (only anonymized `taskRef` references).
 */
export class UsageRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insert(record: UsageRecord): void {
    this.db
      .prepare(
        `INSERT INTO UsageEvents (
           id, source, agent, provider, model, session_id, task_id, task_ref,
           occurred_at, request_count, latency_ms, exit_code, timed_out,
           input_tokens, input_tokens_src, input_tokens_note,
           output_tokens, output_tokens_src, output_tokens_note,
           total_tokens, total_tokens_src, total_tokens_note,
           cost_currency, cost_amount, cost_src, cost_note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.source,
        record.agent,
        record.provider,
        record.model,
        record.sessionId,
        record.taskId,
        record.taskRef,
        record.occurredAt,
        record.requestCount,
        record.latencyMs,
        record.exitCode,
        record.timedOut ? 1 : 0,
        record.tokens.input.value,
        record.tokens.input.source,
        record.tokens.input.note ?? null,
        record.tokens.output.value,
        record.tokens.output.source,
        record.tokens.output.note ?? null,
        record.tokens.total.value,
        record.tokens.total.source,
        record.tokens.total.note ?? null,
        record.cost.currency,
        record.cost.amount.value,
        record.cost.amount.source,
        record.cost.amount.note ?? null,
      );
  }

  public get(id: string): UsageRecord | undefined {
    const row = this.db.prepare("SELECT * FROM UsageEvents WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row === undefined ? undefined : usageFromRow(row);
  }

  /** Every record, oldest → newest. */
  public all(): UsageRecord[] {
    const rows = this.db.prepare("SELECT * FROM UsageEvents ORDER BY occurred_at, id").all() as Row[];
    return rows.map(usageFromRow);
  }

  /** Records matching `query`, oldest → newest, bounded by `query.limit`. */
  public find(query: UsageQuery): UsageRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (query.provider !== undefined) {
      where.push("provider = ?");
      params.push(query.provider);
    }
    if (query.agent !== undefined) {
      where.push("agent = ?");
      params.push(query.agent);
    }
    if (query.sessionId !== undefined) {
      where.push("session_id = ?");
      params.push(query.sessionId);
    }
    if (query.taskId !== undefined) {
      where.push("task_id = ?");
      params.push(query.taskId);
    }
    if (query.from !== undefined) {
      where.push("occurred_at >= ?");
      params.push(query.from);
    }
    if (query.to !== undefined) {
      where.push("occurred_at <= ?");
      params.push(query.to);
    }
    const sql = `SELECT * FROM UsageEvents${
      where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY occurred_at, id${query.limit !== undefined ? " LIMIT ?" : ""}`;
    if (query.limit !== undefined) {
      params.push(query.limit);
    }
    const rows = this.db.prepare(sql).all(...params) as Row[];
    return rows.map(usageFromRow);
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM UsageEvents").run().changes);
  }
}

function usageFromRow(row: Row): UsageRecord {
  const input: MeasuredQuantity = quantityFromRow(row, "input_tokens");
  const output: MeasuredQuantity = quantityFromRow(row, "output_tokens");
  const total: MeasuredQuantity = quantityFromRow(row, "total_tokens");
  return {
    id: colString(row, "id") ?? "",
    source: colString(row, "source") === "session" ? "session" : "provider",
    agent: colString(row, "agent") ?? "",
    provider: colString(row, "provider") ?? "",
    model: colString(row, "model"),
    sessionId: colString(row, "session_id"),
    taskId: colString(row, "task_id"),
    taskRef: colString(row, "task_ref"),
    occurredAt: colString(row, "occurred_at") ?? "",
    requestCount: colNumber(row, "request_count"),
    latencyMs: nullableNumber(row, "latency_ms"),
    exitCode: nullableNumber(row, "exit_code"),
    timedOut: colBoolean(row, "timed_out"),
    tokens: { input, output, total },
    cost: {
      currency: colString(row, "cost_currency"),
      amount: quantityFromRow(row, "cost_amount", "cost_src"),
    },
  };
}

function quantityFromRow(row: Row, valueKey: string, sourceKey = `${valueKey}_src`): MeasuredQuantity {
  const source = colString(row, sourceKey) as QuantitySource | null;
  const value = nullableNumber(row, valueKey);
  const note = colString(row, `${valueKey}_note`);
  return {
    source: source ?? "unknown",
    value,
    ...(note === null ? {} : { note }),
  };
}

function nullableNumber(row: Row, key: string): number | null {
  const value = row[key];
  if (typeof value === "number") {
    return value;
  }
  return typeof value === "bigint" ? Number(value) : null;
}
