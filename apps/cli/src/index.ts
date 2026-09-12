#!/usr/bin/env node
import pkg from "../package.json";
import { createCli } from "./cli";
import { checkForUpdate } from "./update-checker";

// Surface otherwise-silent async failures (memory/DB-lock/spawn errors) so
// benchmark runs print a stack trace instead of exiting with no output.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  process.exitCode = 1;
});

await createCli().parseAsync(process.argv);

// Non-blocking update check (fire-and-forget, never delays CLI output)
checkForUpdate(pkg.version).catch(() => {});
