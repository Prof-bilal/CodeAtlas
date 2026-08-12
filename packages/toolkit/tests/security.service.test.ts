import { describe, expect, it } from "vitest";
import { SecurityAssessor } from "../src/security.service";

const base = {
  toolName: "safe-tool",
  license: "MIT",
  repository: "https://github.com/example/safe-tool",
  packageSource: "official-registry" as const,
  packageName: "safe-tool",
  dependenciesDeclared: true,
  installCommand: { binary: "npm", args: ["install", "safe-tool"] },
  permissions: ["network", "process"] as const,
  maintainer: "Example Maintainer",
  releaseProvenance: "sha256:abc",
};

describe("SecurityAssessor", () => {
  it("defaults to unverified and reports each check", async () => {
    const result = await new SecurityAssessor(() => new Date("2026-01-01T00:00:00.000Z")).assess(
      base,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("unverified");
      expect(result.value.trust).toBe("unverified");
      expect(result.value.checks.map((check) => check.id)).toEqual([
        "license",
        "source",
        "install-command",
        "dependencies",
        "permissions",
        "maintainer",
        "release-provenance",
        "repository",
      ]);
    }
  });

  it("rejects hostile command metadata without executing it", async () => {
    const result = await new SecurityAssessor().assess({
      ...base,
      installCommand: { binary: "npm", args: ["install", "safe-tool; whoami"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("blocked");
      expect(result.value.checks.find((check) => check.id === "install-command")?.verdict).toBe(
        "fail",
      );
      expect(result.value.risk).toBe("critical");
    }
  });

  it("blocks secret access and declared blocks", async () => {
    const secret = await new SecurityAssessor().assess({ ...base, permissions: ["secrets"] });
    expect(secret.ok && secret.value.status).toBe("blocked");
    const blocked = await new SecurityAssessor().assess({ ...base, declaredStatus: "blocked" });
    expect(blocked.ok && blocked.value.status).toBe("blocked");
  });

  it("promotes only a documented human review", async () => {
    const result = await new SecurityAssessor().assess({
      ...base,
      humanReview: {
        passed: true,
        verified: true,
        reviewer: "reviewer",
        checklist: ["metadata", "install-path", "provenance"],
      },
    });
    expect(result.ok && result.value.trust).toBe("verified");
  });

  it("requires explicit override for unverified tools", async () => {
    const assessor = new SecurityAssessor();
    const denied = await assessor.decide(base);
    expect(denied.ok && denied.value.allowed).toBe(false);
    const allowed = await assessor.decide(base, { granted: true, note: "I reviewed the risks" });
    expect(allowed.ok && allowed.value.allowed).toBe(true);
    expect(allowed.ok && allowed.value.overrideApplied).toBe(true);
  });
});
