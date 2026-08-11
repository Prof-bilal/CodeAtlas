import type {
  CostRecord,
  GroupedUsageStatistics,
  LatencyStatistics,
  MeasuredQuantity,
  QuantitySource,
  TokenUsageRecord,
  UsageRecord,
  UsageStatistics,
} from "@atlas/core";
import { combineSources } from "./cost";

/** Roll up a set of usage records into {@link UsageStatistics}. */
export function aggregateUsage(records: readonly UsageRecord[]): UsageStatistics {
  const latencies = records
    .filter((record) => record.latencyMs !== null)
    .map((record) => record.latencyMs as number);
  const latency = latencyStats(latencies);

  const byProvider: Record<string, GroupedUsageStatistics> = {};
  const byDay: Record<string, GroupedUsageStatistics> = {};
  for (const record of records) {
    byProvider[record.provider] = groupStats(byProvider[record.provider], record);
    const day = record.occurredAt.slice(0, 10);
    byDay[day] = groupStats(byDay[day], record);
  }

  return {
    events: records.length,
    requests: records.reduce((sum, record) => sum + record.requestCount, 0),
    tokens: sumTokens(records),
    cost: sumCost(records),
    latency,
    byProvider,
    byDay,
  };
}

/** Per-field sum of token quantities, with the worst provenance of the parts. */
export function sumTokens(records: readonly UsageRecord[]): TokenUsageRecord {
  return {
    input: sumQuantity(records.map((record) => record.tokens.input)),
    output: sumQuantity(records.map((record) => record.tokens.output)),
    total: sumQuantity(records.map((record) => record.tokens.total)),
  };
}

/**
 * Sum costs. Amounts are only added when they share a single currency; mixed
 * or absent currencies yield `unknown` (summing different currencies would be
 * dishonest).
 */
export function sumCost(records: readonly UsageRecord[]): CostRecord {
  const known = records
    .map((record) => record.cost.amount)
    .filter((amount) => amount.value !== null);
  if (known.length === 0) {
    return {
      currency: null,
      amount: { source: "unknown", value: null, note: "no known costs" },
    };
  }
  const currencies = new Set(
    records
      .filter((record) => record.cost.amount.value !== null)
      .map((record) => record.cost.currency)
      .filter((currency) => currency !== null) as string[],
  );
  if (currencies.size !== 1) {
    return {
      currency: null,
      amount: { source: "unknown", value: null, note: "costs are in mixed currencies" },
    };
  }
  const value = known.reduce((sum, amount) => sum + (amount.value as number), 0);
  return {
    currency: [...currencies][0],
    amount: {
      source: worstSource(known.map((amount) => amount.source)),
      value: round(value, 6),
    },
  };
}

function sumQuantity(quantities: readonly MeasuredQuantity[]): MeasuredQuantity {
  const known = quantities.filter((quantity) => quantity.value !== null);
  if (known.length === 0) {
    return { source: "unknown", value: null, note: "no known values" };
  }
  const value = known.reduce((sum, quantity) => sum + (quantity.value as number), 0);
  const source = worstSource(known.map((quantity) => quantity.source));
  return {
    source,
    value,
    ...(source === "actual" ? {} : { note: "sum includes estimated or unknown values" }),
  };
}

function latencyStats(latencies: readonly number[]): LatencyStatistics {
  if (latencies.length === 0) {
    const missing: MeasuredQuantity = { source: "unknown", value: null, note: "no latency data" };
    return { samples: 0, avgMs: missing, maxMs: missing, p95Ms: missing };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const average = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const p95Index = Math.floor((sorted.length - 1) * 0.95);
  return {
    samples: latencies.length,
    avgMs: { source: "actual", value: Math.round(average) },
    maxMs: { source: "actual", value: sorted[sorted.length - 1] },
    p95Ms: { source: "actual", value: sorted[p95Index] },
  };
}

/** Merge one record into a running group aggregate. */
function groupStats(
  current: GroupedUsageStatistics | undefined,
  record: UsageRecord,
): GroupedUsageStatistics {
  const previous = current ?? emptyGroup();
  return {
    events: previous.events + 1,
    requests: previous.requests + record.requestCount,
    tokens: {
      input: appendQuantity(previous.tokens.input, record.tokens.input),
      output: appendQuantity(previous.tokens.output, record.tokens.output),
      total: appendQuantity(previous.tokens.total, record.tokens.total),
    },
    cost: appendCost(previous.cost, record.cost),
  };
}

function emptyGroup(): GroupedUsageStatistics {
  const zero: MeasuredQuantity = { source: "unknown", value: null };
  return {
    events: 0,
    requests: 0,
    tokens: { input: zero, output: zero, total: zero },
    cost: { currency: null, amount: zero },
  };
}

/** Add one quantity into a running sum (both must be known to sum). */
function appendQuantity(sum: MeasuredQuantity, next: MeasuredQuantity): MeasuredQuantity {
  if (sum.value === null && next.value === null) {
    return { source: "unknown", value: null };
  }
  if (sum.value === null || next.value === null) {
    const known = sum.value === null ? next : sum;
    return { source: known.source, value: known.value };
  }
  const source = combineSources(sum.source, next.source);
  return {
    source,
    value: sum.value + next.value,
    ...(source === "actual" ? {} : { note: "sum includes estimated or unknown values" }),
  };
}

function appendCost(sum: CostRecord, next: CostRecord): CostRecord {
  if (sum.currency !== null && next.currency !== null && sum.currency !== next.currency) {
    return { currency: null, amount: { source: "unknown", value: null } };
  }
  const currency = sum.currency ?? next.currency;
  return { currency, amount: appendQuantity(sum.amount, next.amount) };
}

function worstSource(sources: readonly QuantitySource[]): QuantitySource {
  let worst: QuantitySource = "actual";
  for (const source of sources) {
    worst = combineSources(worst, source);
  }
  return worst;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
