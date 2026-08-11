import type { Command } from "commander";
import { resolve } from "node:path";
import { startStdioServer } from "@atlas/mcp";
import { resolveProjectRoot } from "./search";

/**
 * Start the CodeAtlas MCP server over stdio for the current project. This is
 * what AI coding tools (Claude Desktop, Cursor, VS Code, …) connect to.
 */
export function registerMcp(program: Command): void {
  program
    .command("mcp")
    .description("Start the CodeAtlas MCP server over stdio (for AI coding tools)")
    .option("--root <path>", "project root to index (defaults to ATLAS_ROOT or cwd)")
    .action(async (options: { root?: string }) => {
      const root = options.root === undefined ? resolveProjectRoot() : resolve(options.root);
      await startStdioServer({ root });
    });
}
