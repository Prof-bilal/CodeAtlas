/**
 * `@prof-bilal/atlas-mcp` — a Model Context Protocol (MCP) server that exposes a project's
 * CodeAtlas context to external AI tools over stdio.
 *
 * The server consumes only `@prof-bilal/atlas-sdk` (per the dependency matrix) and is
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
  runTool,
  startStdioServer,
  type CodeAtlasMcpServer,
  type McpServerOptions,
} from "./server";
export { createLogger, type LogLevel, type Logger, type LoggerOptions } from "./log";
export {
  TOOLS,
  TOOL_ALIASES,
  TOOL_NAMES,
  PROTOCOL_TOOL_NAMES,
  SYMBOL_KINDS,
  SUMMARY_KINDS,
  freshnessField,
  timingsField,
  summaryShape,
  resolveToolName,
  type RunnableTool,
  type ToolDefinition,
  type ToolName,
} from "./tools";
export { HANDLERS } from "./handlers";
export { executeHandler } from "./handler-utils";
export {
  ToolDomainError,
  ToolInputError,
  optionalBoolean,
  optionalEnum,
  optionalInt,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireInt,
  requireString,
  type ToolArgs,
} from "./validation";
export { isDeniedPath } from "./deny";
export {
  FreshnessController,
  type FreshnessControllerOptions,
  type FreshnessReport,
} from "./freshness";
export type { DependencyShape, HandlerContext, SummaryShape, ToolTimings } from "./handlers";
export {
  normalizeScore,
  toInternalMinScore,
  confidenceFromScore,
  type NormalizedScore,
  type ScoreConfidence,
} from "./score";
export { createContextToolSource, createContextToolSourceFromSDK } from "./tool-bridge";
export { zodToJsonSchema } from "./zod-to-json-schema";
export {
  ToolCallBudget,
  createToolCallBudget,
  readBudgetConfigFromEnv,
  type BudgetCheckResult,
  type ToolCallBudgetConfig,
  type ToolCallBudgetEntry,
  type ToolCallBudgetSnapshot,
} from "./budget";
