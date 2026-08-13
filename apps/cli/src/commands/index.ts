import type { Command } from "commander";
import { type ContextCommandOptions, registerContext } from "./context";
import { registerDoctor } from "./doctor";
import { registerExplain } from "./explain";
import { registerIndexingCommands } from "./indexing";
import { registerMcp } from "./mcp";
import { registerSearch } from "./search";
import { registerSessions } from "./sessions";
import { registerTools } from "./tools";
import type { ToolsCommandOptions } from "./tools";
import { registerTui } from "./tui";
import { registerUsage } from "./usage";

/** Register every CLI command on the given program. */
export function registerCommands(
  program: Command,
  options: Pick<ToolsCommandOptions, "toolkit"> & ContextCommandOptions = {},
): void {
  registerIndexingCommands(program);
  registerSearch(program);
  registerSessions(program);
  registerUsage(program);
  registerTools(program, options.toolkit === undefined ? {} : { toolkit: options.toolkit });
  registerContext(
    program,
    options.integration === undefined ? {} : { integration: options.integration },
  );
  registerExplain(program);
  registerDoctor(program);
  registerMcp(program);
  registerTui(program);
}
