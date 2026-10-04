import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CHATGPT_TOOLS, CHATGPT_TOOL_NAMES, chatGptTool } from "../src/tools";
import { UI_RESOURCES_LIST } from "../src/ui-resources";

describe("ChatGPT tool registry", () => {
  it("exposes exactly the five focused tools", () => {
    expect([...CHATGPT_TOOL_NAMES]).toEqual([
      "analyze_repository",
      "search_repository",
      "explain_repository",
      "impact_analysis",
      "get_context",
    ]);
    expect(CHATGPT_TOOLS).toHaveLength(5);
  });

  it("gives every tool a title and a routing-oriented description", () => {
    for (const tool of CHATGPT_TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(120);
      expect(tool.description).toMatch(/USE WHEN/);
      expect(tool.description).toMatch(/DO NOT USE/);
    }
  });

  it("declares non-empty input and output schemas", () => {
    for (const tool of CHATGPT_TOOLS) {
      expect(Object.keys(tool.inputSchema).length).toBeGreaterThan(0);
      expect(Object.keys(tool.outputSchema).length).toBeGreaterThan(0);
    }
  });

  it("includes freshness, timings, and nextSteps in every output schema", () => {
    for (const tool of CHATGPT_TOOLS) {
      expect(tool.outputSchema["freshness"], tool.name).toBeDefined();
      expect(tool.outputSchema["timings"], tool.name).toBeDefined();
      expect(tool.outputSchema["nextSteps"], tool.name).toBeDefined();
    }
  });

  it("binds every tool to a widget that exists in the resource list", () => {
    const uris = new Set(UI_RESOURCES_LIST.map((resource) => resource.uri));
    for (const tool of CHATGPT_TOOLS) {
      expect(tool.ui, tool.name).toBeDefined();
      expect(tool.ui?.resourceUri.startsWith("ui://codeatlas/")).toBe(true);
      expect(uris.has(tool.ui?.resourceUri ?? "")).toBe(true);
    }
  });

  it("keeps required arguments required", () => {
    const required: Record<string, string> = {
      search_repository: "query",
      explain_repository: "question",
      impact_analysis: "paths",
      get_context: "target",
    };
    for (const [name, field] of Object.entries(required)) {
      const tool = chatGptTool(name as (typeof CHATGPT_TOOL_NAMES)[number]);
      expect(tool.inputSchema[field], `${name}.${field}`).toBeDefined();
      expect(tool.inputSchema[field]).not.toBeInstanceOf(z.ZodOptional);
    }
  });

  it("throws for an unknown tool name", () => {
    expect(() => chatGptTool("nope" as never)).toThrow(/Unknown ChatGPT tool/);
  });
});
