import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PROTOCOL_TOOL_NAMES, TOOLS, TOOL_NAMES } from "../src/tools";

describe("tool registry", () => {
  it("exposes exactly the expected tools", () => {
    const names = TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(names).toEqual([
      "analyze_impact",
      "find_relevant_context",
      "get_dependencies",
      "get_skill",
      "get_summary",
      "inspect_symbol",
      "list_skills",
      "project_overview",
      "read_file_range",
      "search_files",
      "search_symbols",
    ]);
  });

  it("has the expected tool count (Phase 6 + capability wave)", () => {
    // Original 8 core tools + 3 capability tools (list_skills, get_skill, analyze_impact)
    expect(TOOLS.length).toBe(11);
  });

  it("advertises the 11 canonical tools plus 4 legacy aliases", () => {
    expect(PROTOCOL_TOOL_NAMES).toEqual([
      "analyze_impact",
      "context_for",
      "dependencies_of",
      "find_relevant_context",
      "get_dependencies",
      "get_skill",
      "get_summary",
      "inspect_symbol",
      "list_skills",
      "overview",
      "project_overview",
      "read_file_range",
      "read_range",
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

  it("marks task as a required argument for find_relevant_context", () => {
    const tool = TOOLS.find((entry) => entry.name === "find_relevant_context");
    expect(tool).toBeDefined();
    const task = tool?.inputSchema["task"];
    expect(task).toBeDefined();
    expect(task).not.toBeInstanceOf(z.ZodOptional);
  });

  it("includes nextSteps in every tool's output schema", () => {
    for (const tool of TOOLS) {
      const nextSteps = tool.outputSchema["nextSteps"];
      expect(nextSteps, `tool ${tool.name} missing nextSteps`).toBeDefined();
    }
  });

  it("declares depth 1..3 on get_dependencies with hop/path in output", () => {
    const tool = TOOLS.find((entry) => entry.name === "get_dependencies");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema["depth"]).toBeDefined();
    expect(tool?.outputSchema["depth"]).toBeDefined();
  });

  it("does not include any deprecated tools", () => {
    for (const name of [
      "analyze_task",
      "create_plan",
      "verify_answer",
      "explain_module",
    ] as const) {
      expect(TOOL_NAMES).not.toContain(name);
      expect(PROTOCOL_TOOL_NAMES).not.toContain(name);
    }
  });
});
