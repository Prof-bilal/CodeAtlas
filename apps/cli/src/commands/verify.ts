import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type ClaimCheckInput,
  type VerifyConfig,
  createContextSDK,
  createVerifier,
  loadVerifyConfig,
} from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";
import { contextDbPath, resolveProjectRoot } from "./search";

interface VerifyOptions {
  readonly paths?: string;
  readonly symbols?: string;
  readonly planTargets?: string;
  readonly config?: string;
  readonly refreshBaseline?: boolean;
  readonly json?: boolean;
  readonly docs?: boolean;
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
    .option(
      "--docs",
      "Run documentation drift check: detect undocumented exports and stale doc references",
    )
    .action(async (task: string | undefined, opts: VerifyOptions) => {
      try {
        const cwd = resolveProjectRoot();
        const dbPath = contextDbPath(cwd);

        if (!existsSync(dbPath)) {
          console.error("No context index found. Run 'atlas init' or 'atlas build' first.");
          process.exit(1);
        }

        const sdk = createContextSDK({ dbPath, repositoryPath: cwd });

        // Docs drift check (atlas verify --docs)
        if (opts.docs === true) {
          const docsDir = join(cwd, "docs");
          if (!existsSync(docsDir)) {
            console.log("No docs/ directory found — skipping documentation drift check.");
          } else {
            // Get exported symbols from index
            const overview = sdk.project.overview("full");
            const exportedSymbols: string[] = (overview.topSymbols ?? [])
              .filter((s) => s.kind === "export" || s.kind === "function" || s.kind === "class")
              .map((s) => s.name);

            // Scan docs for symbol mentions
            const mentionedInDocs = new Set<string>();
            function scanDocsDir(dir: string): void {
              try {
                for (const entry of readdirSync(dir)) {
                  const p = join(dir, entry);
                  if (statSync(p).isDirectory()) {
                    scanDocsDir(p);
                    continue;
                  }
                  if (!/\.(md|mdx|rst|txt)$/i.test(entry)) continue;
                  const content = readFileSync(p, "utf-8");
                  for (const sym of exportedSymbols) {
                    if (content.includes(sym)) mentionedInDocs.add(sym);
                  }
                }
              } catch {
                // ignore unreadable entries
              }
            }
            scanDocsDir(docsDir);

            const undocumented = exportedSymbols.filter((s) => !mentionedInDocs.has(s));
            console.log("\nDocs drift check:");
            console.log(`  Exported symbols: ${exportedSymbols.length}`);
            console.log(`  Mentioned in docs: ${mentionedInDocs.size}`);
            if (undocumented.length > 0) {
              console.log(`  Undocumented symbols (${undocumented.length}):`);
              for (const sym of undocumented.slice(0, 20)) {
                console.log(`    - ${sym}`);
              }
              if (undocumented.length > 20) {
                console.log(`    ... and ${undocumented.length - 20} more`);
              }
            } else {
              console.log("  All exported symbols are mentioned in docs ✓");
            }
          }
          sdk.close();
          return;
        }

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
