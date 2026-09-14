import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";

interface EvaluateOptions {
  readonly json?: boolean;
  readonly repo?: string;
}

interface EvaluationResult {
  readonly index: { readonly exists: boolean; readonly path: string };
  readonly build: { readonly status: "pass" | "skip"; readonly note: string };
  readonly tests: { readonly count: number; readonly path: string | null };
  readonly qa: { readonly screenshots: number; readonly path: string };
  readonly browser: { readonly evidence: number; readonly path: string };
  readonly overall: "pass" | "warn" | "fail";
  readonly items: readonly {
    readonly check: string;
    readonly status: "pass" | "warn" | "fail";
    readonly note: string;
  }[];
}

export function registerEvaluate(program: Command): void {
  program
    .command("evaluate")
    .description("Generate a completion report aggregating build, test, QA, and a11y results")
    .option("--repo <path>", "Repository root (default: current directory)")
    .option("--json", "Output report as JSON")
    .action(async (opts: EvaluateOptions) => {
      const root = opts.repo ?? process.cwd();
      const items: {
        check: string;
        status: "pass" | "warn" | "fail";
        note: string;
      }[] = [];

      // 1. Check context index
      const dbPath = join(root, ".codeatlas", "context.db");
      const indexExists = existsSync(dbPath);
      items.push({
        check: "Context index",
        status: indexExists ? "pass" : "warn",
        note: indexExists ? `Found at ${dbPath}` : "No index found — run atlas init first",
      });

      // 2. Check for package.json / build artifacts
      const pkgExists = existsSync(join(root, "package.json"));
      items.push({
        check: "Build config",
        status: pkgExists ? "pass" : "warn",
        note: pkgExists ? "package.json found" : "No package.json found",
      });

      // 3. Check QA artifacts
      const qaDir = join(root, ".codeatlas", "qa");
      const qaExists = existsSync(qaDir);
      let screenshots = 0;
      if (qaExists) {
        try {
          screenshots = readdirSync(qaDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).length;
        } catch {
          // ignore read errors — report 0 screenshots
        }
      }
      items.push({
        check: "Visual QA artifacts",
        status: qaExists && screenshots > 0 ? "pass" : "warn",
        note: qaExists
          ? `${screenshots} screenshot(s) in ${qaDir}`
          : "No QA artifacts found (.codeatlas/qa/)",
      });

      // 4. Browser observation evidence is raw evidence only; this check never invents a score.
      const browserDir = join(root, ".codeatlas", "evidence");
      const browserExists = existsSync(browserDir);
      let browserEvidence = 0;
      if (browserExists) {
        try {
          browserEvidence = readdirSync(browserDir).filter((f) =>
            /\.(png|txt|json)$/i.test(f),
          ).length;
        } catch {
          // ignore read errors — report no readable evidence
        }
      }
      items.push({
        check: "Browser observation evidence",
        status: browserEvidence > 0 ? "pass" : "warn",
        note:
          browserEvidence > 0
            ? `${browserEvidence} evidence file(s) in ${browserDir}`
            : "No browser evidence found — run atlas browse with explicit origin approval",
      });

      // 5. Check for test config
      const hasVitest =
        existsSync(join(root, "vitest.config.ts")) || existsSync(join(root, "vitest.config.js"));
      const hasJest =
        existsSync(join(root, "jest.config.ts")) ||
        existsSync(join(root, "jest.config.js")) ||
        existsSync(join(root, "jest.config.cjs"));
      const hasTests = hasVitest || hasJest;
      items.push({
        check: "Test suite config",
        status: hasTests ? "pass" : "warn",
        note: hasTests
          ? `Found ${hasVitest ? "vitest" : "jest"} config`
          : "No test runner config found",
      });

      const anyFail = items.some((i) => i.status === "fail");
      const anyWarn = items.some((i) => i.status === "warn");
      const overall: "pass" | "warn" | "fail" = anyFail ? "fail" : anyWarn ? "warn" : "pass";

      const result: EvaluationResult = {
        index: { exists: indexExists, path: dbPath },
        build: {
          status: pkgExists ? "pass" : "skip",
          note: pkgExists ? "package.json found" : "skipped",
        },
        tests: { count: 0, path: hasTests ? root : null },
        qa: { screenshots, path: qaDir },
        browser: { evidence: browserEvidence, path: browserDir },
        overall,
        items,
      };

      if (opts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("## CodeAtlas Evaluation Report\n");
        for (const item of items) {
          const icon = item.status === "pass" ? "✓" : item.status === "warn" ? "⚠" : "✗";
          console.log(`  ${icon} ${item.check}: ${item.note}`);
        }
        const overallIcon = overall === "pass" ? "✓" : overall === "warn" ? "⚠" : "✗";
        console.log(`\n${overallIcon} Overall: ${overall.toUpperCase()}`);
      }

      process.exit(overall === "fail" ? 1 : 0);
    });
}
