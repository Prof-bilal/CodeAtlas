import { describe, expect, it } from "vitest";
import { parseLaunchInput } from "../src/chat/slash";

describe("parseLaunchInput", () => {
  it("returns empty for blank input", () => {
    expect(parseLaunchInput("")).toEqual({ kind: "empty" });
    expect(parseLaunchInput("   ")).toEqual({ kind: "empty" });
  });

  it("maps an explicit provider slash command to a launch", () => {
    expect(parseLaunchInput("/claude fix the login bug")).toEqual({
      kind: "launch",
      provider: "claude",
      task: "fix the login bug",
    });
  });

  it("is case-insensitive for the provider name", () => {
    expect(parseLaunchInput("/GEMINI write a test")).toEqual({
      kind: "launch",
      provider: "gemini",
      task: "write a test",
    });
  });

  it("treats a bare task as the default agent", () => {
    expect(parseLaunchInput("fix the login bug")).toEqual({
      kind: "default",
      task: "fix the login bug",
    });
  });

  it("treats /auto as an auto-selection", () => {
    expect(parseLaunchInput("/auto explain this repo")).toEqual({
      kind: "auto",
      task: "explain this repo",
    });
  });

  it("returns unknown with a helpful message for unknown slashes", () => {
    const result = parseLaunchInput("/nope do a thing");
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") {
      expect(result.message).toContain('Unknown agent "/nope"');
    }
  });

  it("gives an explicit envelope provider precedence over the text", () => {
    expect(parseLaunchInput("/gemini run the suite", "codex")).toEqual({
      kind: "launch",
      provider: "codex",
      task: "/gemini run the suite",
    });
  });

  it("uses the envelope provider for bare text", () => {
    expect(parseLaunchInput("do a thing", "opencode")).toEqual({
      kind: "launch",
      provider: "opencode",
      task: "do a thing",
    });
  });
});
