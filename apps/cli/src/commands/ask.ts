import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import type { ContextIntegration, ContextPlan, ContextSlice, TaskClassification } from "@atlas/sdk";
import {
  createClassifier,
  createContextSDK,
  createPlanner,
  renderContextSlice,
  saveContextSlice,
} from "@atlas/sdk";
import type { Command } from "commander";
import { withIntegration } from "./context";
import { contextDbPath, resolveProjectRoot } from "./search";

/** Options for {@link registerAsk} (the injected integration is the test seam). */
export interface AskCommandOptions {
  readonly integration?: ContextIntegration;
}

interface AskOptions {
  readonly repo?: string;
  readonly maxTokens?: number;
  /** `false` when absent, the string copy target when `--save <path>` is given. */
  readonly save?: string | boolean;
  readonly json?: boolean;
  readonly plan?: boolean;
}

/**
 * Register `atlas ask <question>` — the primary selective-delivery UX: it
 * returns a ranked, budgeted context slice for one question, never the whole
 * repository. The slice engine, freshness contract (auto-refresh when stale),
 * and staleness labeling all live in the SDK (`buildSlice`).
 */
export function registerAsk(program: Command, options: AskCommandOptions = {}): void {
  program
    .command("ask <question>")
    .description("Get a ranked, budgeted context slice for a question (never the whole repo)")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option(
      "--max-tokens <number>",
      "maximum estimated tokens for the slice",
      parsePositiveInteger,
      () => Number.parseInt(process.env.MAX_TOKENS ?? "", 10),
    )
    .option(
      "--save [path]",
      "persist the slice under .codeatlas/slices/ (and copy the markdown to <path> when given)",
    )
    .option("--json", "print the slice as JSON")
    .option("--plan", "classify the task and show a deterministic plan before the context")
    .action(async (question: string, commandOptions: AskOptions) =>
      runAsk(question, commandOptions, options.integration),
    );
}

async function runAsk(
  question: string,
  options: AskOptions,
  injected?: ContextIntegration,
): Promise<void> {
  const root = options.repo ?? resolveProjectRoot();
  if (injected === undefined && !existsSync(contextDbPath(root))) {
    console.error(
      `No context index found at ${contextDbPath(root)}. Run \`atlas init\` first, then ask again.`,
    );
    process.exitCode = 1;
    return;
  }
  await withIntegration(
    injected,
    async (integration) => {
      try {
        if (options.plan === true) {
          // When --plan is set, classify the task and show a deterministic plan
          // before building the context slice.
          const classify = createClassifier();
          const classification = classify(question);
          console.log(renderPlanHeader(classification));

          // Build the plan using the SDK's planner (needs a ContextSDK for search/graph).
          const sdk = createContextSDK({
            dbPath: contextDbPath(root),
            repositoryPath: root,
          });
          try {
            const planner = createPlanner(sdk);
            const planResult = planner.plan(question, classification);
            console.log(renderPlan(planResult));
          } finally {
            sdk.close();
          }
          console.log("---\n");
        }

        const slice = await integration.buildSlice({
          task: question,
          ...(options.maxTokens === undefined
            ? {}
            : { budget: { maxTokensTotal: options.maxTokens } }),
        });
        emitSlice(slice, options.json === true);
        if (options.save !== undefined && options.save !== false) {
          const paths = await saveContextSlice(root, slice);
          // Save notes go to stderr so `atlas ask --json | jq` stays parseable.
          console.error(`Saved: ${paths.jsonPath}`);
          console.error(`Saved: ${paths.markdownPath}`);
          if (typeof options.save === "string" && options.save !== "") {
            await copyFile(paths.markdownPath, options.save);
            console.error(`Saved: ${options.save}`);
          }
        }
      } catch (error) {
        reportError(error);
      }
    },
    options.repo,
  );
}

function emitSlice(slice: ContextSlice, json: boolean): void {
  console.log(json ? JSON.stringify(slice, null, 2) : renderContextSlice(slice));
}

function reportError(error: unknown): void {
  console.error(error instanceof Error ? error.message : "atlas ask failed.");
  process.exitCode = 1;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--max-tokens must be a positive integer, got "${value}"`);
  }
  return parsed;
}

// ── Plan rendering ─────────────────────────────────────────────────────────

function renderPlanHeader(classification: TaskClassification): string {
  const lines = [
    "## Task Classification",
    "",
    `- **Category:** ${classification.category}`,
    `- **Subcategory:** ${classification.subcategory}`,
    `- **Confidence:** ${classification.confidence}`,
    `- **Reasoning:** ${classification.reasoning}`,
    "",
  ];
  if (classification.entities.filePaths.length > 0) {
    lines.push(`- **Files:** ${classification.entities.filePaths.join(", ")}`);
  }
  if (classification.entities.symbolNames.length > 0) {
    lines.push(`- **Symbols:** ${classification.entities.symbolNames.join(", ")}`);
  }
  return lines.join("\n");
}

function renderPlan(plan: ContextPlan): string {
  const lines = ["## Plan", ""];
  for (const step of plan.steps) {
    lines.push(`### Step ${step.order}: ${step.action}`);
    lines.push(`> ${step.rationale}`);
    if (step.targetFiles.length > 0) {
      lines.push(`> Targets: ${step.targetFiles.join(", ")}`);
    }
    lines.push("");
  }
  if (plan.unknowns.length > 0) {
    lines.push("**Unknowns:**");
    for (const unknown of plan.unknowns) {
      lines.push(`- ${unknown}`);
    }
    lines.push("");
  }
  lines.push(`**Verification:** ${plan.verificationStrategy}`);
  return lines.join("\n");
}
