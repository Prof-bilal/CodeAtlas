import type { Command } from "commander";
import { registerBuild } from "./build";
import { registerDoctor } from "./doctor";
import { registerExplain } from "./explain";
import { registerInit } from "./init";
import { registerMcp } from "./mcp";
import { registerSearch } from "./search";
import { registerSessions } from "./sessions";
import { registerTools } from "./tools";
import { registerUpdate } from "./update";
import { registerUsage } from "./usage";

/** Register every CLI command on the given program. */
export function registerCommands(program: Command): void {
  registerInit(program);
  registerBuild(program);
  registerUpdate(program);
  registerSearch(program);
  registerSessions(program);
  registerUsage(program);
  registerTools(program);
  registerExplain(program);
  registerDoctor(program);
  registerMcp(program);
}
