import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type Fixture, createFixture, silentLogger } from "../../../packages/mcp/tests/fixture";
import { type ChatGptServer, type ChatGptServerOptions, createChatGptServer } from "../src/server";

/** A connected client + server over an in-memory MCP transport. */
export interface Connection {
  readonly server: ChatGptServer;
  readonly client: Client;
  readonly fixture: Fixture;
  cleanup(): Promise<void>;
}

/** Connect a real MCP client to the plugin server for a fixture. */
export async function connectTo(
  options: ChatGptServerOptions = {},
  fixture: Fixture = createFixture(),
): Promise<Connection> {
  const server = createChatGptServer({ root: fixture.root, logger: silentLogger(), ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "plugin-test-client", version: "0.0.0" }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    server,
    client,
    fixture,
    cleanup: async () => {
      await server.close();
      await client.close();
      fixture.cleanup();
    },
  };
}

/** Run a block against a connected client, always cleaning up. */
export async function withConnection(
  fn: (conn: Connection) => Promise<void>,
  options: ChatGptServerOptions = {},
  fixture: Fixture = createFixture(),
): Promise<void> {
  const conn = await connectTo(options, fixture);
  try {
    await fn(conn);
  } finally {
    await conn.cleanup();
  }
}

/** Concatenate the text blocks of a tool result. */
export function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: readonly unknown[] }).content ?? [];
  return content.map((block) => (isTextBlock(block) ? block.text : "")).join("\n");
}

function isTextBlock(block: unknown): block is { readonly type: "text"; readonly text: string } {
  return (
    typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
  );
}

/** `structuredContent` of a tool result, or undefined. */
export function structuredOf(result: unknown): Record<string, unknown> | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  return (result as { structuredContent?: Record<string, unknown> }).structuredContent;
}

/** Whether a tool result signals an error. */
export function isErrorResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { isError?: unknown }).isError === true
  );
}
