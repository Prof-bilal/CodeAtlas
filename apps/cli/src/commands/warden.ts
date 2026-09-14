import { createWardenService } from "@atlas/sdk";
import type { Command } from "commander";

interface CommonOptions {
  readonly json?: boolean;
}

export function registerWarden(program: Command): void {
  const warden = program
    .command("warden")
    .description("Inspect and explicitly run MCP processes in Warden");

  warden
    .command("status")
    .description("Report Warden availability without executing it")
    .option("--json", "Output as JSON")
    .action((options: CommonOptions) => {
      const status = createWardenService().status();
      console.log(options.json === true ? JSON.stringify(status, null, 2) : renderStatus(status));
    });

  warden
    .command("run <command> [args...]")
    .description("Explicitly run a command through Warden using a policy file")
    .requiredOption("--policy <path>", "Warden policy file")
    .option("--cwd <path>", "Working directory (default: current directory)")
    .option("--timeout <ms>", "Timeout in milliseconds")
    .option("--json", "Output captured result as JSON")
    .action(
      async (
        command: string,
        args: string[],
        options: CommonOptions & {
          readonly policy: string;
          readonly cwd?: string;
          readonly timeout?: string;
        },
      ) => {
        const service = createWardenService();
        try {
          const result = await service.run({
            policyPath: options.policy,
            command,
            ...(args.length > 0 ? { args } : {}),
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            ...(options.timeout === undefined ? {} : { timeoutMs: Number(options.timeout) }),
          });
          if (options.json === true) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`Warden exit: ${result.exitCode ?? "signal"}`);
            if (result.stdout.length > 0) console.log(result.stdout);
            if (result.stderr.length > 0) console.error(result.stderr);
          }
          if (result.timedOut || result.exitCode !== 0) process.exitCode = 1;
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      },
    );
}

function renderStatus(status: {
  readonly installed: boolean;
  readonly path: string | null;
  readonly enabled: boolean;
  readonly note: string;
}): string {
  return [
    `Warden: ${status.installed ? "available" : "not installed"}`,
    `Enabled: ${status.enabled ? "yes" : "no"}`,
    ...(status.path === null ? [] : [`Path: ${status.path}`]),
    status.note,
  ].join("\n");
}
