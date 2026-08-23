/**
 * `@atlas/mcp` — a Model Context Protocol (MCP) server that exposes a project's
 * CodeAtlas context to external AI tools over stdio.
 *
 * The server consumes only `@atlas/sdk` (per the dependency matrix) and is
 * provider-independent: search, dependencies, module explanation, and overview
 * are deterministic reads of the persisted index; AI summary generation is
 * opt-in per call and goes through whatever provider is wired into the SDK.
 */
export {
  CodeAtlasContext,
  resolveContextConfig,
  type CodeAtlasContextOptions,
  type ResolvedContextConfig,
} from "./context";
export {
  createMcpServer,
  startStdioServer,
  type CodeAtlasMcpServer,
  type McpServerOptions,
} from "./server";
export { createLogger, type LogLevel, type Logger, type LoggerOptions } from "./log";
export { TOOLS, TOOL_NAMES, type ToolDefinition, type ToolName } from "./tools";
export {
  FreshnessController,
  type FreshnessControllerOptions,
  type FreshnessReport,
} from "./freshness";
export type { DependencyShape, HandlerContext, SummaryShape } from "./handlers";
export { createContextToolSource, createContextToolSourceFromSDK } from "./tool-bridge";
export { zodToJsonSchema } from "./zod-to-json-schema";
