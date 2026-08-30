import { describe, expect, it } from "vitest";
import {
  addKnownFacts,
  addRisk,
  createAgentState,
  nextRound,
  recordFileInspected,
  recordToolUsage,
  recordVerificationRun,
  renderStateSummary,
  setClassification,
  setPlan,
  setStopReason,
} from "../src/context-tools/state";

describe("AgentState", () => {
  it("creates a fresh state with defaults", () => {
    const state = createAgentState("fix auth bug");
    expect(state.task).toBe("fix auth bug");
    expect(state.round).toBe(0);
    expect(state.knownFacts).toEqual([]);
    expect(state.filesInspected).toEqual([]);
    expect(state.toolsUsed).toEqual([]);
    expect(state.risks).toEqual([]);
    expect(state.verificationRuns).toEqual([]);
    expect(state.planSteps).toEqual([]);
    expect(state.stopReason).toBeUndefined();
  });

  it("increments round", () => {
    const s0 = createAgentState("task");
    const s1 = nextRound(s0);
    expect(s1.round).toBe(1);
    const s2 = nextRound(s1);
    expect(s2.round).toBe(2);
  });

  it("records tool usage", () => {
    const state = createAgentState("task");
    const s1 = recordToolUsage(state, {
      name: "search_symbols",
      queryKey: "auth",
      round: 0,
      cached: false,
    });
    expect(s1.toolsUsed).toHaveLength(1);
    expect(s1.toolsUsed[0]?.name).toBe("search_symbols");
    expect(s1.toolsUsed[0]?.cached).toBe(false);
  });

  it("adds known facts and deduplicates", () => {
    const state = createAgentState("task");
    const s1 = addKnownFacts(state, ["auth.ts exists", "UserService is exported"]);
    const s2 = addKnownFacts(s1, ["auth.ts exists", "login function found"]);
    expect(s2.knownFacts).toEqual([
      "auth.ts exists",
      "UserService is exported",
      "login function found",
    ]);
  });

  it("compacts known facts beyond MAX_KNOWN_FACTS", () => {
    let state = createAgentState("task");
    for (let i = 0; i < 60; i++) {
      state = addKnownFacts(state, [`fact-${i}`]);
    }
    expect(state.knownFacts.length).toBeLessThanOrEqual(50);
    // Most recent facts should be kept
    expect(state.knownFacts).toContain("fact-59");
    expect(state.knownFacts).not.toContain("fact-0");
  });

  it("records files inspected (dedup)", () => {
    const state = createAgentState("task");
    const s1 = recordFileInspected(state, "/src/auth.ts");
    const s2 = recordFileInspected(s1, "/src/auth.ts");
    expect(s2.filesInspected).toEqual(["/src/auth.ts"]);
    const s3 = recordFileInspected(s2, "/src/user.ts");
    expect(s3.filesInspected).toEqual(["/src/auth.ts", "/src/user.ts"]);
  });

  it("records verification runs", () => {
    const state = createAgentState("task");
    const s1 = recordVerificationRun(state, {
      strategy: "claim-checks",
      claimsPassed: 3,
      claimsFailed: 0,
      commandsRun: [],
      verdict: "pass",
    });
    expect(s1.verificationRuns).toHaveLength(1);
    expect(s1.verificationRuns[0]?.verdict).toBe("pass");
  });

  it("adds risks", () => {
    const state = createAgentState("task");
    const s1 = addRisk(state, "might break backward compat");
    expect(s1.risks).toEqual(["might break backward compat"]);
  });

  it("sets stop reason", () => {
    const state = createAgentState("task");
    const s1 = setStopReason(state, "max-rounds");
    expect(s1.stopReason).toBe("max-rounds");
  });

  it("sets classification", () => {
    const state = createAgentState("task");
    const s1 = setClassification(state, {
      category: "bug",
      confidence: 0.85,
      entities: ["auth.ts"],
    });
    expect(s1.category).toBe("bug");
    expect(s1.confidence).toBe(0.85);
    expect(s1.entities).toEqual(["auth.ts"]);
  });

  it("sets plan", () => {
    const state = createAgentState("task");
    const s1 = setPlan(state, {
      steps: [{ order: 1, action: "fix bug", targetFiles: ["a.ts"], rationale: "reason" }],
      impactSet: ["a.ts"],
      unknowns: [],
      verificationStrategy: "command-runners",
    });
    expect(s1.planSteps).toHaveLength(1);
    expect(s1.planFiles).toEqual(["a.ts"]);
    expect(s1.verificationStrategy).toBe("command-runners");
  });

  it("compacts toolsUsed beyond MAX_TOOLS_USED", () => {
    let state = createAgentState("task");
    for (let i = 0; i < 65; i++) {
      state = recordToolUsage(state, {
        name: "search_symbols",
        queryKey: `q${i}`,
        round: 0,
        cached: false,
      });
    }
    expect(state.toolsUsed.length).toBeLessThanOrEqual(60);
    // Most recent should be kept
    expect(state.toolsUsed.at(-1)?.queryKey).toBe("q64");
  });
});

describe("renderStateSummary", () => {
  it("renders a minimal summary for empty state", () => {
    const state = createAgentState("fix bug");
    const summary = renderStateSummary(state);
    expect(summary).toContain("AgentState round=0");
    expect(summary).toContain("Task: fix bug");
  });

  it("renders plan steps", () => {
    let state = createAgentState("fix auth");
    state = setPlan(state, {
      steps: [
        { order: 1, action: "read auth.ts", targetFiles: ["auth.ts"], rationale: "need to see" },
        { order: 2, action: "fix login", targetFiles: ["auth.ts"], rationale: "broken" },
      ],
      impactSet: ["auth.ts"],
      unknowns: ["which crypto lib?"],
      verificationStrategy: "command-runners",
    });
    const summary = renderStateSummary(state);
    expect(summary).toContain("Plan: 2 steps (command-runners verification)");
    expect(summary).toContain("1. read auth.ts");
    expect(summary).toContain("2. fix login");
    expect(summary).toContain("Unknowns: which crypto lib?");
  });

  it("renders known facts", () => {
    let state = createAgentState("task");
    state = addKnownFacts(state, ["auth.ts exports AuthService", "login is async"]);
    const summary = renderStateSummary(state);
    expect(summary).toContain("Known facts (2 total):");
    expect(summary).toContain("- auth.ts exports AuthService");
  });

  it("renders files inspected", () => {
    let state = createAgentState("task");
    state = recordFileInspected(state, "/src/auth.ts");
    state = recordFileInspected(state, "/src/user.ts");
    const summary = renderStateSummary(state);
    expect(summary).toContain("Files inspected (2):");
    expect(summary).toContain("/src/auth.ts");
  });

  it("renders tools used", () => {
    let state = createAgentState("task");
    state = recordToolUsage(state, {
      name: "search_symbols",
      queryKey: "auth",
      round: 0,
      cached: false,
    });
    state = recordToolUsage(state, {
      name: "get_dependencies",
      queryKey: "user",
      round: 1,
      cached: false,
    });
    const summary = renderStateSummary(state);
    expect(summary).toContain("Tools used (2):");
    expect(summary).toContain("search_symbols");
  });

  it("renders risks", () => {
    let state = createAgentState("task");
    state = addRisk(state, "might break backward compat");
    const summary = renderStateSummary(state);
    expect(summary).toContain("Risks: might break backward compat");
  });

  it("renders stop reason", () => {
    let state = createAgentState("task");
    state = setStopReason(state, "max-rounds");
    const summary = renderStateSummary(state);
    expect(summary).toContain("Stop: max-rounds");
  });

  it("summary is bounded", () => {
    let state = createAgentState("x".repeat(500));
    for (let i = 0; i < 50; i++) {
      state = addKnownFacts(state, [`fact-${"y".repeat(100)}-${i}`]);
    }
    for (let i = 0; i < 50; i++) {
      state = recordFileInspected(state, `/path/${"z".repeat(50)}-${i}.ts`);
    }
    const summary = renderStateSummary(state);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});
