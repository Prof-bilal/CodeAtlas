import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createContextSDK } from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";

interface TraceOptions {
  readonly file?: string;
  readonly repo?: string;
  readonly json?: boolean;
  readonly maxFrames?: string;
}

interface ResolvedFrame {
  readonly raw: string;
  readonly file: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly symbol: string | null;
  readonly indexedPath: string | null;
  readonly found: boolean;
}

interface TraceResult {
  readonly frames: readonly ResolvedFrame[];
  readonly resolved: number;
  readonly total: number;
}

// Parse a V8/Node stack trace line
function parseFrame(line: string): {
  file: string | null;
  lineNum: number | null;
  col: number | null;
  sym: string | null;
} {
  // V8: "    at FunctionName (path/to/file.ts:10:5)"
  const v8Match =
    /at (?:([^(]+) )?\(?((?:[a-zA-Z]:)?[^:)]+\.(?:ts|js|mts|mjs|tsx|jsx|cjs|cts))(?::(\d+))?(?::(\d+))?\)?/.exec(
      line,
    );
  if (v8Match !== null) {
    return {
      sym: v8Match[1]?.trim() ?? null,
      file: v8Match[2] ?? null,
      lineNum: v8Match[3] !== undefined ? Number.parseInt(v8Match[3], 10) : null,
      col: v8Match[4] !== undefined ? Number.parseInt(v8Match[4], 10) : null,
    };
  }
  return { file: null, lineNum: null, col: null, sym: null };
}

export function registerTrace(program: Command): void {
  program
    .command("trace")
    .description(
      "Parse a stack trace and ground it against the CodeAtlas index (resolve frames to indexed symbols and call paths)",
    )
    .argument("[stacktrace]", "Stack trace text (or pipe via stdin)")
    .option("--file <path>", "Read stack trace from a file")
    .option("--repo <path>", "Repository root (default: current directory)")
    .option("--max-frames <n>", "Maximum frames to resolve", "20")
    .option("--json", "Output as JSON")
    .action(async (stacktrace: string | undefined, opts: TraceOptions) => {
      const root = opts.repo ?? process.cwd();
      const dbPath = join(root, ".codeatlas", "context.db");

      if (!existsSync(dbPath)) {
        console.error("No context index found. Run 'atlas init' first.");
        process.exit(1);
      }

      // Read stack trace input
      let input: string;
      if (opts.file !== undefined) {
        input = readFileSync(opts.file, "utf-8");
      } else if (stacktrace !== undefined) {
        input = stacktrace;
      } else if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        input = Buffer.concat(chunks).toString("utf-8");
      } else {
        console.error("Provide a stack trace as argument, --file, or via stdin.");
        process.exit(1);
        return;
      }

      const maxFrames = Number.parseInt(opts.maxFrames ?? "20", 10);
      const sdk = createContextSDK({ dbPath, repositoryPath: root });

      try {
        const lines = input
          .split("\n")
          .filter((l) => /at /.test(l))
          .slice(0, maxFrames);
        const frames: ResolvedFrame[] = [];

        for (const line of lines) {
          const { file, lineNum, col, sym } = parseFrame(line.trim());

          let indexedPath: string | null = null;
          let found = false;

          if (file !== null) {
            // Try to find this file in the context index
            try {
              const filename = file.split("/").pop() ?? file;
              const searchResults = sdk.files.searchFiles(filename, {
                limit: 5,
              });
              const match = searchResults.find(
                (r) =>
                  r.path !== null &&
                  (r.path.endsWith(file) || file.endsWith(r.path.replace(/^\//, ""))),
              );
              if (match !== undefined && match.path !== null) {
                indexedPath = match.path;
                found = true;
              }
            } catch {
              // index may not have this file — leave found = false
            }
          }

          frames.push({
            raw: line.trim(),
            file,
            line: lineNum,
            column: col,
            symbol: sym,
            indexedPath,
            found,
          });
        }

        const result: TraceResult = {
          frames,
          resolved: frames.filter((f) => f.found).length,
          total: frames.length,
        };

        if (opts.json === true) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log("## Stack Trace Analysis\n");
        console.log(
          `Resolved ${result.resolved}/${result.total} frames against CodeAtlas index.\n`,
        );

        for (const frame of frames) {
          const icon = frame.found ? "✓" : "○";
          const loc =
            frame.file !== null
              ? `${frame.file}${frame.line !== null ? `:${frame.line}` : ""}`
              : "unknown";
          const frameSym = frame.symbol !== null ? ` (${frame.symbol})` : "";
          console.log(`  ${icon} ${loc}${frameSym}`);
          if (frame.found && frame.indexedPath !== null) {
            console.log(`      → indexed: ${frame.indexedPath}`);
          }
        }
      } finally {
        sdk.close();
      }
    });
}
