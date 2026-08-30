import type { Command } from "commander";
import { type AgentsCommandOptions, registerAgents } from "./agents";
import { registerAsk } from "./ask";
import { registerBenchmark } from "./benchmark";
import { type ContextCommandOptions, registerAgentRouter, registerContext } from "./context";
import { type DoctorCommandOptions, registerDoctor } from "./doctor";
import { registerExplain } from "./explain";
import { type IndexingCommandOptions, registerIndexingCommands } from "./indexing";
import { registerMcp } from "./mcp";
import { registerMetrics } from "./metrics";
import { registerOllama, registerProviders } from "./providers";
import { registerScan } from "./scan";
import { type SearchCommandOptions, registerSearch } from "./search";
import { type SessionsCommandOptions, registerSessions } from "./sessions";
import { registerTools } from "./tools";
import type { ToolsCommandOptions } from "./tools";
import { registerUsage } from "./usage";
import { registerVerify } from "./verify";

/** Register every CLI command on the given program. */
export function registerCommands(
  program: Command,
  options: Pick<ToolsCommandOptions, "toolkit"> &
    Pick<IndexingCommandOptions, "summary" | "prompt"> &
    ContextCommandOptions &
    AgentsCommandOptions &
    DoctorCommandOptions &
    SessionsCommandOptions &
    SearchCommandOptions = {},
): void {
  registerIndexingCommands(program, {
    ...(options.toolkit === undefined ? {} : { toolkit: options.toolkit }),
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
    ...(options.summary === undefined ? {} : { summary: options.summary }),
  });
  registerSearch(program, options.summary === undefined ? {} : { summary: options.summary });
  registerScan(program);
  registerSessions(program, options.sessions === undefined ? {} : { sessions: options.sessions });
  registerUsage(program);
  registerMetrics(program);
  registerProviders(program);
  registerOllama(program);
  registerAgents(program, options.agentMcp === undefined ? {} : { agentMcp: options.agentMcp });
  registerTools(program, options.toolkit === undefined ? {} : { toolkit: options.toolkit });
  registerAsk(
    program,
    options.integration === undefined ? {} : { integration: options.integration },
  );
  registerContext(
    program,
    options.integration === undefined ? {} : { integration: options.integration },
  );
  registerAgentRouter(
    program,
    options.integration === undefined ? {} : { integration: options.integration },
  );
  registerExplain(program);
  registerDoctor(program, options.doctor === undefined ? {} : { doctor: options.doctor });
  registerMcp(program);
  registerBenchmark(program);
  registerVerify(program);
}
