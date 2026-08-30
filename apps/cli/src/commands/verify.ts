import { existsSync, readFileSync } from "node:fs";
import {
  type ClaimCheckInput,
  type VerifyConfig,
  createContextSDK,
  createVerifier,
  loadVerifyConfig,
} from "@atlas/sdk";
import type { Command } from "commander";
import { contextDbPath, resolveProjectRoot } from "./search";

interface VerifyOptions {
  readonly paths?: string;
  readonly symbols?: string;
  readonly planTargets?: string;
  readonly config?: string;
  readonly refreshBaseline?: boolean;
  readonly json?: boolean;
}

export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("Run claim checks and verification commands against an answer")
    .argument("[task]", "The task description to verify against")
    .option("--paths <paths>", "Comma-separated file paths cited in the answer")
    .option("--symbols <symbols>", "Comma-separated symbol names cited in the answer")
    .option("--plan-targets <targets>", "Comma-separated plan targets the answer should cover")
    .option("--config <path>", "Path to verify.json (default: .codeatlas/verify.json)")
    .option("--refresh-baseline", "Refresh the baseline before verifying")
    .option("--json", "Output results as JSON")
    .action(async (task: string | undefined, opts: VerifyOptions) => {
      try {
        const cwd = resolveProjectRoot();
        const dbPath = contextDbPath(cwd);

        if (!existsSync(dbPath)) {
          console.error("No context index found. Run 'atlas init' or 'atlas build' first.");
          process.exit(1);
        }

        const sdk = createContextSDK({ dbPath, repositoryPath: cwd });

        // Resolve symbols from the context index
        const resolveSymbols = async (): Promise<readonly string[]> => {
          try {
            const overview = sdk.project.overview("summary");
            return (overview.topSymbols ?? []).map((s) => s.name);
          } catch {
            return [];
          }
        };

        const verifier = createVerifier({
          resolveSymbols,
          getAnswerText: () => task ?? "",
          computeFingerprint: async () => {
            // Simple fingerprint: just use cwd + mtime of db
            return `${cwd}:${existsSync(dbPath) ? "exists" : "missing"}`;
          },
          log: (msg) => console.error(msg),
        });

        // Build claim input
        const claimInput: ClaimCheckInput = {
          task: task ?? "",
          citedPaths: opts.paths ? opts.paths.split(",").map((s) => s.trim()) : [],
          citedSymbols: opts.symbols ? opts.symbols.split(",").map((s) => s.trim()) : [],
          planTargets: opts.planTargets ? opts.planTargets.split(",").map((s) => s.trim()) : [],
        };

        // Load config
        let config: VerifyConfig | undefined;
        if (opts.config) {
          const raw = JSON.parse(readFileSync(opts.config, "utf-8"));
          config = {
            enabled: raw.enabled ?? true,
            commands: raw.commands ?? {},
          };
        } else {
          config = loadVerifyConfig(cwd) ?? undefined;
        }

        // Run verification
        const report = await verifier.verify(claimInput, config, cwd);

        // Output
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log("\n  Verification Report");
          console.log(`  ${"─".repeat(50)}`);
          console.log(`  Task: ${report.task || "(no task)"}`);
          console.log(`  Strategy: ${report.strategy}`);
          console.log(`  Verdict: ${report.verdict.toUpperCase()}`);
          console.log(`  Summary: ${report.summary}`);

          if (report.claims.checks.length > 0) {
            console.log(
              `\n  Claim Checks (${report.claims.passed}/${report.claims.passed + report.claims.failed} passed):`,
            );
            for (const check of report.claims.checks) {
              const icon = check.passed ? "✓" : "✗";
              console.log(`    ${icon} [${check.kind}] ${check.target}: ${check.detail}`);
            }
          }

          if (report.commands.length > 0) {
            console.log(`\n  Commands (${report.commands.length} run):`);
            for (const cmd of report.commands) {
              const icon = cmd.exitCode === 0 ? "✓" : cmd.preExisting ? "⚠" : "✗";
              const label = cmd.preExisting ? "pre-existing" : "";
              console.log(
                `    ${icon} ${cmd.command} ${cmd.args.join(" ")} → exit ${cmd.exitCode} ${label} (${cmd.durationMs}ms)`,
              );
            }
          }

          console.log();
        }

        if (report.verdict === "fail") {
          process.exit(1);
        }
      } catch (err) {
        console.error(`Verify failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
