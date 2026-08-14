import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOLS, TOOL_NAMES } from "../src/tools";

describe("tool registry", () => {
  it("exposes exactly the seven expected tools", () => {
    const names = TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(names).toEqual([
      "explain_module",
      "get_dependencies",
      "get_summary",
      "project_overview",
      "read_file_range",
      "search_files",
      "search_symbols",
    ]);
  });

  it("gives every tool a title and a descriptive body", () => {
    for (const tool of TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("declares a non-empty input schema for every tool", () => {
    for (const tool of TOOLS) {
      expect(Object.keys(tool.inputSchema).length).toBeGreaterThan(0);
    }
  });

  it("marks query as a required (non-optional) argument for the search tools", () => {
    for (const name of ["search_symbols", "search_files"] as const) {
      const tool = TOOLS.find((entry) => entry.name === name);
      expect(tool).toBeDefined();
      const query = tool?.inputSchema["query"];
      expect(query).toBeDefined();
      expect(query).not.toBeInstanceOf(z.ZodOptional);
    }
  });
});
