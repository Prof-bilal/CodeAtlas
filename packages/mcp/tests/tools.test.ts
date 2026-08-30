import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOLS, TOOL_NAMES, type ToolName } from "../src/tools";

describe("tool registry", () => {
  it("exposes exactly the twelve expected tools", () => {
    const names = TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(names).toEqual([
      "analyze_task",
      "create_plan",
      "explain_module",
      "find_relevant_context",
      "get_dependencies",
      "get_summary",
      "inspect_symbol",
      "project_overview",
      "read_file_range",
      "search_files",
      "search_symbols",
      "verify_answer",
    ]);
  });

  it("has at most 12 tools (ADR-017 cap)", () => {
    expect(TOOLS.length).toBeLessThanOrEqual(12);
  });

  it("lists high-level tools before low-level tools", () => {
    const highLevel: ToolName[] = [
      "analyze_task",
      "create_plan",
      "find_relevant_context",
      "inspect_symbol",
      "verify_answer",
    ];
    const indices = highLevel.map((name) => TOOL_NAMES.indexOf(name));
    // All high-level tools should appear before all low-level tools.
    const maxHighLevel = Math.max(...indices);
    const lowLevel = TOOL_NAMES.filter((name) => !highLevel.includes(name));
    const minLowLevel = Math.min(...lowLevel.map((name) => TOOL_NAMES.indexOf(name)));
    expect(maxHighLevel).toBeLessThan(minLowLevel);
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

  it("marks task as a required argument for analyze_task, create_plan, and find_relevant_context", () => {
    for (const name of ["analyze_task", "create_plan", "find_relevant_context"] as const) {
      const tool = TOOLS.find((entry) => entry.name === name);
      expect(tool).toBeDefined();
      const task = tool?.inputSchema["task"];
      expect(task).toBeDefined();
      expect(task).not.toBeInstanceOf(z.ZodOptional);
    }
  });

  it("includes nextSteps in every tool's output schema", () => {
    for (const tool of TOOLS) {
      const nextSteps = tool.outputSchema["nextSteps"];
      expect(nextSteps, `tool ${tool.name} missing nextSteps`).toBeDefined();
    }
  });
});
