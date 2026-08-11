import type { UsageRecord } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { UsageStore } from "../src";

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: "id-1",
    source: "provider",
    agent: "claude",
    provider: "claude",
    model: "claude-sonnet-5",
    sessionId: "s-1",
    taskId: null,
    taskRef: "task-1 (hashed)",
    occurredAt: "2026-08-11T10:00:00.000Z",
    requestCount: 1,
    latencyMs: 123,
    exitCode: null,
    timedOut: false,
    tokens: {
      input: { source: "actual", value: 100 },
      output: { source: "actual", value: 200 },
      total: { source: "actual", value: 300 },
    },
    cost: { currency: "USD", amount: { source: "estimated", value: 0.0033, note: "estimated" } },
    ...overrides,
  };
}

describe("UsageStore", () => {
  it("round-trips a record including nulls and notes", () => {
    const store = new UsageStore({ filePath: ":memory:" });
    const input = record({
      model: null,
      sessionId: null,
      exitCode: 0,
      tokens: {
        input: { source: "unknown", value: null, note: "no data" },
        output: { source: "unknown", value: null, note: "no data" },
        total: { source: "unknown", value: null, note: "no data" },
      },
    });
    store.insertUsage(input);
    expect(store.getUsage("id-1")).toEqual(input);
    expect(store.listUsage()).toEqual([input]);
    expect(store.version).toBe(1);
    store.close();
  });

  it("keeps multiple records in oldest → newest order", () => {
    const store = new UsageStore({ filePath: ":memory:" });
    store.insertUsage(record({ id: "a", occurredAt: "2026-08-11T10:00:00.000Z" }));
    store.insertUsage(record({ id: "b", occurredAt: "2026-08-10T10:00:00.000Z" }));
    const records = store.listUsage();
    expect(records.map((item) => item.id)).toEqual(["b", "a"]);
    expect(records[0].occurredAt < records[1].occurredAt).toBe(true);
  });

  it("upserts budgets and limits per scope", () => {
    const store = new UsageStore({ filePath: ":memory:" });
    store.upsertBudget({
      id: "budget-1",
      scope: { kind: "agent", value: "claude" },
      tokenLimit: 100,
      costLimit: null,
      currency: null,
      createdAt: "2026-08-11T10:00:00.000Z",
    });
    store.upsertBudget({
      id: "budget-2",
      scope: { kind: "agent", value: "claude" },
      tokenLimit: 200,
      costLimit: null,
      currency: null,
      createdAt: "2026-08-11T11:00:00.000Z",
    });
    expect(store.listBudgets()).toHaveLength(1);
    expect(store.getBudget({ kind: "agent", value: "claude" })?.tokenLimit).toBe(200);

    store.upsertLimit({
      id: "limit-1",
      scope: { kind: "provider", value: "openai" },
      tokenLimit: 1_000,
      costLimit: 5,
      currency: "USD",
      createdAt: "2026-08-11T10:00:00.000Z",
    });
    expect(store.getLimit({ kind: "provider", value: "openai" })?.costLimit).toBe(5);
    expect(store.listLimits()).toHaveLength(1);
  });

  it("returns empty lists on a fresh store", () => {
    const store = new UsageStore();
    expect(store.listUsage()).toEqual([]);
    expect(store.listBudgets()).toEqual([]);
    expect(store.listLimits()).toEqual([]);
    store.close();
  });

  it("applies custom migrations and reports the latest version", () => {
    const store = new UsageStore({
      filePath: ":memory:",
      migrations: [
        {
          version: 1,
          name: "create-usage-schema",
          up: (db) => {
            db.exec("CREATE TABLE Usage (id TEXT PRIMARY KEY);");
          },
        },
      ],
    });
    expect(store.version).toBe(1);
    store.close();
  });
});
