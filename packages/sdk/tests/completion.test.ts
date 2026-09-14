import { describe, expect, it } from "vitest";
import { createAtlasCompletion } from "../src/completion";

describe("ATLAS completion summary", () => {
  it("reports ready state with optional Warden warning", () => {
    const result = createAtlasCompletion({
      toolsInstalled: 2,
      skillsInstalled: 3,
      warden: "not-installed",
    });
    expect(result.ready).toBe(true);
    expect(result.banner).toBe("ATLAS READY");
    expect(result.tools.status).toBe("ready");
    expect(result.warnings[0]).toContain("Warden is not installed");
  });

  it("reports blockers separately from warnings", () => {
    const result = createAtlasCompletion({
      toolsInstalled: 1,
      skillsInstalled: 0,
      warden: "available",
      blockers: ["tool validation failed"],
    });
    expect(result.ready).toBe(false);
    expect(result.banner).toBe("ATLAS SETUP INCOMPLETE");
    expect(result.blockers).toEqual(["tool validation failed"]);
    expect(result.warnings[0]).toContain("available but remains opt-in");
  });
});
