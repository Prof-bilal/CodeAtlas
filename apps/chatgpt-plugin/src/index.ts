/**
 * `@prof-bilal/atlas-chatgpt-plugin` — a small ChatGPT/Codex plugin over MCP.
 *
 * It exposes **five focused, goal-oriented tools** built entirely on the
 * existing `@prof-bilal/atlas-mcp` handlers and the Context SDK:
 *
 * - `analyze_repository` — structure, counts, areas, findings
 * - `search_repository`  — where functionality lives
 * - `explain_repository` — grounded architecture explanations + relationships
 * - `impact_analysis`    — change blast radius from the indexed graph
 * - `get_context`        — focused code for a file or symbol
 *
 * Plus optional MCP Apps widgets for three of them. No indexing, parsing,
 * graph, storage, or search logic is reimplemented here.
 */
export {
  createChatGptServer,
  type ChatGptServer,
  type ChatGptServerOptions,
} from "./server";
export { startStdioServer } from "./stdio";
export {
  DEFAULT_HTTP_PORT,
  MCP_PATH,
  isLoopback,
  startHttpServer,
  type HttpServerOptions,
  type RunningHttpServer,
} from "./http";
export {
  CHATGPT_TOOLS,
  CHATGPT_TOOL_NAMES,
  chatGptTool,
  type ChatGptToolDefinition,
  type ChatGptToolName,
  type ChatGptUiBinding,
} from "./tools";
export { ADAPTER_HANDLERS } from "./handlers";
export {
  UI_RESOURCES,
  UI_RESOURCES_LIST,
  registerUiResources,
  type UiResourceDefinition,
} from "./ui-resources";
