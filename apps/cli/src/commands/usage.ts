import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type BudgetStatus,
  type CostRecord,
  type MeasuredQuantity,
  type UsagePort,
  type UsageQuery,
  type UsageRecord,
  type UsageScope,
  type UsageStatistics,
  createUsageService,
} from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

/** Path of the on-disk usage database for a project root. */
export function usageDbPath(root: string): string {
  return join(root, ".codeatlas", "usage.db");
}

/**
 * Open a usage service for a project root, creating `.codeatlas/` if needed.
 * Used by the usage commands and by other commands to record AI activity.
 */
export function openUsage(root: string): UsagePort {
  const dbPath = usageDbPath(root);
  mkdirSync(dirname(dbPath), { recursive: true });
  return createUsageService({ filePath: dbPath });
}

/** Render a measured quantity: value + provenance, or `unknown`. */
export function formatMeasured(value: MeasuredQuantity): string {
  if (value.value === null) {
    return "unknown";
  }
  const label = value.source === "actual" ? "" : ` (${value.source})`;
  return `${value.value}${label}`;
}

/** Render a cost: currency + amount, or `unknown`. */
export function formatCost(cost: CostRecord): string {
  if (cost.amount.value === null) {
    return "unknown";
  }
  return `${cost.currency === null ? "" : `${cost.currency} `}${cost.amount.value}`;
}

/**
 * Map CLI filter options to a storage {@link UsageQuery}.
 * Blank / undefined values are ignored so the query stays minimal.
 */
export function buildUsageQuery(opts: {
  provider?: string;
  task?: string;
}): UsageQuery {
  return {
    ...(opts.provider !== undefined && opts.provider !== "" ? { provider: opts.provider } : {}),
    ...(opts.task !== undefined && opts.task !== "" ? { taskId: opts.task } : {}),
  };
}

/** Render the `atlas usage` summary (totals, latency, budgets). */
export function renderUsageSummary(
  stats: UsageStatistics,
  budgets: readonly BudgetStatus[],
): string {
  const lines = [
    "Usage summary",
    `Events:      ${stats.events}`,
    `Requests:    ${stats.requests}`,
    `Tokens:      input ${formatMeasured(stats.tokens.input)} / output ${formatMeasured(
      stats.tokens.output,
    )} / total ${formatMeasured(stats.tokens.total)}`,
    `Cost:        ${formatCost(stats.cost)}`,
    `Avg latency: ${stats.latency.samples === 0 ? "unknown" : `${stats.latency.avgMs.value}ms`}`,
  ];
  if (budgets.length > 0) {
    lines.push("", "Budgets");
    for (const status of budgets) {
      lines.push(renderBudgetStatus(status));
    }
  }
  return lines.join("\n");
}

/** Render one budget's consumption vs its limits. */
export function renderBudgetStatus(status: BudgetStatus): string {
  const budget = status.budget;
  const token =
    budget.tokenLimit === null
      ? "no token budget"
      : `${formatMeasured(status.consumedTokens.total)} / ${budget.tokenLimit}${
          status.tokenPercent === null ? "" : ` (${status.tokenPercent}%)`
        }`;
  const cost =
    budget.costLimit === null
      ? "no cost budget"
      : `${formatCost(status.consumedCost)} / ${budget.currency ?? ""}${budget.costLimit}${
          status.costPercent === null ? "" : ` (${status.costPercent}%)`
        }`;
  return `  ${scopeLabel(budget.scope)}  tokens: ${token}  cost: ${cost}`;
}

/** Render the `atlas usage list` table. */
export function renderUsageTable(records: readonly UsageRecord[]): string {
  if (records.length === 0) {
    return "No usage recorded.";
  }
  const headers = ["ID", "Agent", "Provider", "Model", "Tokens", "Cost", "Latency", "When"];
  const rows = records.map((record) => [
    record.id,
    record.agent,
    record.provider,
    record.model ?? "unknown",
    formatMeasured(record.tokens.total),
    formatCost(record.cost),
    record.latencyMs === null ? "unknown" : `${record.latencyMs}ms`,
    record.occurredAt,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const pad = (cells: readonly string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index] + 2)).join("");
  const rule = widths.map((width) => "─".repeat(width)).join("  ");
  return [pad(headers), rule, ...rows.map((row) => pad(row))].join("\n");
}

export function registerUsage(program: Command): void {
  const usage = program
    .command("usage")
    .description("Show AI usage, credits, budgets, and limits (local-first)");

  usage
    .command("list")
    .description("List recorded usage events")
    .option("--json", "print results as JSON")
    .option("--provider <provider>", "filter by provider")
    .option("--task <taskId>", "filter by task ID")
    .action(async (options: { json?: boolean; provider?: string; task?: string }) => {
      await listUsage(options);
    });

  usage
    .command("budgets")
    .description("Show budget status")
    .option("--json", "print results as JSON")
    .action(async (options: { json?: boolean }) => {
      await showBudgets(options);
    });

  const budget = usage.command("budget").description("Manage token/cost budgets");
  budget
    .command("set")
    .description("Create or replace a budget for a scope")
    .requiredOption("--scope <kind:value>", "scope, e.g. provider:openai or agent:claude")
    .option("--tokens <n>", "token budget")
    .option("--cost <n>", "cost budget")
    .option("--currency <code>", "currency for the cost budget")
    .action(async (options: BudgetSetOptions) => {
      await setBudgetCommand(options);
    });

  const limit = usage.command("limit").description("Manage hard token/cost limits");
  limit
    .command("set")
    .description("Create or replace a hard limit for a scope")
    .requiredOption("--scope <kind:value>", "scope, e.g. provider:openai or agent:claude")
    .option("--tokens <n>", "hard token cap")
    .option("--cost <n>", "hard cost cap")
    .option("--currency <code>", "currency for the cost cap")
    .action(async (options: BudgetSetOptions) => {
      await setLimitCommand(options);
    });

  // Bare `atlas usage` prints the summary, mirroring `atlas usage summary`.
  usage
    .command("summary")
    .description("Show usage totals, latency, and budget status")
    .option("--json", "print results as JSON")
    .option("--provider <provider>", "filter by provider")
    .option("--task <taskId>", "filter by task ID")
    .action(async (options: { json?: boolean; provider?: string; task?: string }) => {
      await showSummary(options);
    });

  // Note: the parent declares no `--json` — Commander would otherwise consume
  // the flag before dispatching to a subcommand (e.g. `atlas usage list --json`).
  usage.action(() => {
    return showSummary({});
  });
}

function withUsage(fn: (usage: UsagePort) => Promise<void>): Promise<void> {
  const root = resolveProjectRoot();
  const dbPath = usageDbPath(root);
  mkdirSync(dirname(dbPath), { recursive: true });
  const usage = createUsageService({ filePath: dbPath });
  try {
    return fn(usage);
  } finally {
    usage.close();
  }
}

async function listUsage(options: {
  json?: boolean;
  provider?: string;
  task?: string;
}): Promise<void> {
  await withUsage(async (usage) => {
    const records = usage.listUsage(buildUsageQuery(options));
    if (options.json === true) {
      console.log(JSON.stringify({ records }, null, 2));
      return;
    }
    console.log(renderUsageTable(records));
  });
}

async function showBudgets(options: { json?: boolean }): Promise<void> {
  await withUsage(async (usage) => {
    const statuses = usage
      .listBudgets()
      .map((budget) => usage.budgetStatus(budget.scope))
      .filter((status) => status !== undefined) as BudgetStatus[];
    if (options.json === true) {
      console.log(JSON.stringify({ budgets: statuses }, null, 2));
      return;
    }
    if (statuses.length === 0) {
      console.log("No budgets.");
      return;
    }
    console.log(statuses.map((status) => renderBudgetStatus(status)).join("\n"));
  });
}

async function showSummary(options: {
  json?: boolean;
  provider?: string;
  task?: string;
}): Promise<void> {
  await withUsage(async (usage) => {
    const stats = usage.statistics(buildUsageQuery(options));
    const statuses = usage
      .listBudgets()
      .map((budget) => usage.budgetStatus(budget.scope))
      .filter((status) => status !== undefined) as BudgetStatus[];
    if (options.json === true) {
      console.log(JSON.stringify({ statistics: stats, budgets: statuses }, null, 2));
      return;
    }
    console.log(renderUsageSummary(stats, statuses));
  });
}

interface BudgetSetOptions {
  readonly scope: string;
  readonly tokens?: string;
  readonly cost?: string;
  readonly currency?: string;
}

function parseScope(value: string): UsageScope {
  const index = value.indexOf(":");
  const kind = index === -1 ? "" : value.slice(0, index);
  const scopeValue = index === -1 ? "" : value.slice(index + 1);
  if (
    (kind !== "agent" && kind !== "provider" && kind !== "session" && kind !== "user") ||
    scopeValue === ""
  ) {
    throw new Error(`Invalid --scope "${value}". Use <agent|provider|session|user>:<value>.`);
  }
  return { kind, value: scopeValue };
}

function parseAmount(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${flag} "${raw}". Expected a positive number.`);
  }
  return value;
}

async function setBudgetCommand(options: BudgetSetOptions): Promise<void> {
  const scope = parseScope(options.scope);
  const tokenLimit = parseAmount(options.tokens, "--tokens");
  const costLimit = parseAmount(options.cost, "--cost");
  await withUsage(async (usage) => {
    const result = usage.setBudget({
      scope,
      ...(tokenLimit === undefined ? {} : { tokenLimit }),
      ...(costLimit === undefined ? {} : { costLimit }),
      ...(options.currency === undefined ? {} : { currency: options.currency }),
    });
    if (!result.ok) {
      console.error(result.error.message);
      process.exitCode = 1;
      return;
    }
    console.log(`Budget set for ${scopeLabel(scope)}.`);
  });
}

async function setLimitCommand(options: BudgetSetOptions): Promise<void> {
  const scope = parseScope(options.scope);
  const tokenLimit = parseAmount(options.tokens, "--tokens");
  const costLimit = parseAmount(options.cost, "--cost");
  await withUsage(async (usage) => {
    const result = usage.setLimit({
      scope,
      ...(tokenLimit === undefined ? {} : { tokenLimit }),
      ...(costLimit === undefined ? {} : { costLimit }),
      ...(options.currency === undefined ? {} : { currency: options.currency }),
    });
    if (!result.ok) {
      console.error(result.error.message);
      process.exitCode = 1;
      return;
    }
    console.log(`Limit set for ${scopeLabel(scope)}.`);
  });
}

function scopeLabel(scope: UsageScope): string {
  return `${scope.kind}:${scope.value}`;
}
