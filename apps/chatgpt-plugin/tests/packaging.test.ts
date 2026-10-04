import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHATGPT_TOOLS } from "../src/tools";
import { UI_RESOURCES_LIST } from "../src/ui-resources";

function readJson(relative: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("plugin packaging metadata", () => {
  const manifest = readJson("../plugin/manifest.json");

  it("describes the plugin with name, description, and developer", () => {
    expect(manifest["name"]).toBe("CodeAtlas");
    expect(typeof manifest["description"]).toBe("string");
    expect((manifest["description"] as string).length).toBeGreaterThan(40);
    const developer = manifest["developer"] as { name?: string };
    expect(developer.name).toContain("CodeAtlas");
  });

  it("lists exactly the registered tools", () => {
    const tools = manifest["tools"] as Array<{ name: string }>;
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      CHATGPT_TOOLS.map((tool) => tool.name).sort(),
    );
  });

  it("binds each manifest tool to a real widget", () => {
    const uris = new Set(UI_RESOURCES_LIST.map((resource) => resource.uri));
    const tools = manifest["tools"] as Array<{ name: string; widget: string }>;
    for (const tool of tools) {
      expect(uris.has(tool.widget), tool.name).toBe(true);
    }
  });

  it("declares both transports with the real binary name", () => {
    const mcp = manifest["mcp"] as {
      stdio?: { command?: string };
      streamableHttp?: { url?: string; transport?: string };
    };
    expect(mcp.stdio?.command).toBe("codeatlas-chatgpt-mcp");
    expect(mcp.streamableHttp?.transport).toBe("streamable-http");
    expect(mcp.streamableHttp?.url).toContain("/mcp");
  });

  it("ships a client config, icons, and a privacy policy", () => {
    const mcpConfig = readJson("../plugin/mcp.json");
    const servers = mcpConfig["mcpServers"] as Record<string, { command?: string }>;
    expect(servers["codeatlas"]?.command).toBe("codeatlas-chatgpt-mcp");
    // Referenced assets must exist (readFileSync throws otherwise).
    expect(
      readFileSync(fileURLToPath(new URL("../plugin/PRIVACY.md", import.meta.url)), "utf8"),
    ).toContain("local-first");
    expect(
      readFileSync(fileURLToPath(new URL("../plugin/icons/logo.svg", import.meta.url)), "utf8"),
    ).toContain("<svg");
    expect(
      readFileSync(fileURLToPath(new URL("../plugin/codex.toml.example", import.meta.url)), "utf8"),
    ).toContain("[mcp_servers.codeatlas]");
  });
});
