import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ApprovedProofCommand,
  type BeginChangeInput,
  createProofSDK,
  denyFilter,
  loadVerifyConfig,
} from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

export function registerProve(program: Command): void {
  program
    .command("prove")
    .description("Manage revision-aware change proofs and emit completion receipts")
    .argument(
      "<operation>",
      "begin | understand | goals | adopt | coverage | authorize | check | status | verify | receipt | export | import | history | watch",
    )
    .argument("[changeId]", "change session id")
    .option("--repo <path>", "repository path")
    .option(
      "--input <path>",
      "explicit JSON BeginChangeInput, proposal array or goal adoption input",
    )
    .option("--node <id>", "verification obligation node id")
    .option("--approve-commands", "approve configured verification commands for this invocation")
    .option("--require-goal", "exit 1 unless the goal status is SATISFIED")
    .action(
      async (
        operation: string,
        changeId: string | undefined,
        options: {
          repo?: string;
          input?: string;
          node?: string;
          approveCommands?: boolean;
          requireGoal?: boolean;
        },
      ) => {
        let sdk: Awaited<ReturnType<typeof createProofSDK>> | undefined;
        let displayRoot: string | undefined;
        try {
          const resolvedOperation =
            /^[a-f0-9]{32}$/.test(operation) && changeId === undefined ? "receipt" : operation;
          const resolvedChangeId =
            /^[a-f0-9]{32}$/.test(operation) && changeId === undefined ? operation : changeId;
          if (
            ![
              "begin",
              "understand",
              "goals",
              "adopt",
              "coverage",
              "authorize",
              "check",
              "status",
              "verify",
              "receipt",
              "export",
              "import",
              "history",
              "watch",
            ].includes(resolvedOperation)
          )
            throw new Error("Unknown proof operation.");
          const root = options.repo ?? resolveProjectRoot();
          displayRoot = resolve(root);
          const commands: Record<string, ApprovedProofCommand> = {};
          if (options.approveCommands) {
            const config = loadVerifyConfig(root);
            if (config?.enabled)
              for (const [key, value] of Object.entries(config.commands)) {
                if (!["typecheck", "build", "test", "tests"].includes(key))
                  throw new Error(
                    "Proof command category must be typecheck, build, test or tests.",
                  );
                commands[key] = {
                  config: value,
                  level: key === "typecheck" || key === "build" ? 2 : 3,
                };
              }
          }
          sdk = await createProofSDK({ repositoryPath: root, commands });
          let input: unknown;
          if (options.input) {
            const path = resolve(options.input);
            if (
              !path.endsWith(".json") ||
              !denyFilter(path, "").accepted ||
              (await realpath(path)) !== path
            )
              throw new Error("Proof input must be a safe, non-redirected JSON file.");
            const info = await lstat(path);
            if (!info.isFile() || info.size > 8 * 1024 * 1024)
              throw new Error("Proof input exceeds the file bound.");
            input = JSON.parse(await readFile(path, "utf8"));
          }
          if (resolvedOperation === "begin" && !input)
            throw new Error("begin requires --input with goal and explicit proof proposals.");
          if (!["begin", "import", "watch"].includes(resolvedOperation) && !resolvedChangeId)
            throw new Error("A change id is required.");
          const id = resolvedChangeId ?? "";
          let result: unknown;
          if (resolvedOperation === "begin") result = await sdk.begin(input as BeginChangeInput);
          else if (resolvedOperation === "import") result = await sdk.importState(input);
          else if (resolvedOperation === "history") result = await sdk.history(id);
          else if (resolvedOperation === "watch") {
            const watcher = await sdk.watch({
              onChange: (report) =>
                console.log(
                  JSON.stringify({
                    changeId: report.session.id,
                    state: report.session.state,
                    debt: report.debt,
                  }),
                ),
              onError: (error) => console.error(error.message),
            });
            try {
              await new Promise<void>((resolve) => {
                const stop = () => {
                  process.off("SIGINT", stop);
                  process.off("SIGTERM", stop);
                  resolve();
                };
                process.once("SIGINT", stop);
                process.once("SIGTERM", stop);
              });
            } finally {
              await watcher.close();
            }
            return;
          } else if (resolvedOperation === "authorize") {
            if (!Array.isArray(input))
              throw new Error("authorize requires an explicit justification array.");
            result = await sdk.authorize(id, input);
          } else if (resolvedOperation === "understand") {
            if (!Array.isArray(input))
              throw new Error("understand requires --input with a proposal array.");
            result = await sdk.understand(id, input);
          } else if (resolvedOperation === "goals") {
            result = await sdk.goal(id);
          } else if (resolvedOperation === "coverage") {
            const goal = await sdk.goal(id);
            result = { coverage: goal.coverage, graph: await sdk.goalGraph(id) };
          } else if (resolvedOperation === "adopt") {
            if (!input || typeof input !== "object" || Array.isArray(input))
              throw new Error("adopt requires --input with criterion keys or a goal draft.");
            const request = input as Record<string, unknown>;
            if (request["approved"] === false)
              throw new Error("Goal adoption requires explicit approval.");
            const draft =
              request["draft"] ?? (Array.isArray(request["criteria"]) ? request : undefined);
            if (draft) await sdk.stageGoalDraft(id, draft as never);
            const criterionKeys = Array.isArray(request["criterionKeys"])
              ? (request["criterionKeys"] as string[])
              : Array.isArray((draft as { criteria?: { key?: string }[] } | undefined)?.criteria)
                ? (draft as { criteria: { key: string }[] }).criteria.map(
                    (criterion) => criterion.key,
                  )
                : undefined;
            if (!criterionKeys?.length)
              throw new Error("adopt requires criterionKeys or a goal draft with criteria.");
            result = await sdk.adoptGoal(id, {
              approved: true,
              criterionKeys,
              ...(Array.isArray(request["outcomeKeys"])
                ? { outcomeKeys: request["outcomeKeys"] as string[] }
                : {}),
              ...(Array.isArray(request["decisions"])
                ? {
                    decisions: request["decisions"] as { key: string; reason: string }[],
                  }
                : {}),
            });
          } else if (resolvedOperation === "verify") {
            if (!options.node) throw new Error("verify requires --node.");
            result = await sdk.verify(id, options.node);
          } else if (resolvedOperation === "export") result = await sdk.exportState(id);
          else if (resolvedOperation === "receipt") {
            const receipt = await sdk.prove(id);
            result = receipt;
            if (receipt.completion !== "proven") process.exitCode = 1;
            if (options.requireGoal && receipt.goalStatus !== "SATISFIED") process.exitCode = 1;
          } else result = await sdk.check(id);
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          let message = error instanceof Error ? error.message : "Proof operation failed.";
          if (displayRoot) message = message.replaceAll(displayRoot, "<repo>");
          if (options.input) message = message.replaceAll(resolve(options.input), "<input>");
          console.error(
            denyFilter("proof-error.txt", message).accepted
              ? message
              : "Proof operation failed; sensitive details omitted.",
          );
          process.exitCode = 1;
        } finally {
          sdk?.close();
        }
      },
    );
}
