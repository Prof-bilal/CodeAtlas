import type { Result } from "@atlas/sdk";
import { fail, ok } from "@atlas/sdk";
import type { HandlerContext } from "./handlers";
import type { ToolArgs } from "./validation";

/**
 * Execute a tool handler with a uniform try/catch wrapper.
 *
 * Both the MCP server (`server.ts`) and the tool bridge (`tool-bridge.ts`)
 * previously duplicated the same handler-call + error-extraction pattern.
 * This function centralises that logic so both consumers share a single
 * implementation and the error-message extraction stays consistent.
 */
export async function executeHandler(
  hctx: HandlerContext,
  handler: (h: HandlerContext, args: ToolArgs) => Promise<unknown>,
  args: ToolArgs,
): Promise<Result<unknown>> {
  try {
    return ok(await handler(hctx, args));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(new Error(message));
  }
}
