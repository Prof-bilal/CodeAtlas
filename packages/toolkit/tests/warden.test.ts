import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WardenService } from "../src/warden";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("Warden service", () => {
  it("reports availability without executing the runtime", () => {
    const service = new WardenService({ resolveBinary: () => "/usr/local/bin/warden" });
    expect(service.status()).toEqual({
      installed: true,
      path: "/usr/local/bin/warden",
      enabled: false,
      note: "Warden is available but remains opt-in until an explicit sandboxed run is requested.",
    });
  });

  it("builds an argument-array plan and rejects missing policies", () => {
    const root = mkdtempSync(join("/tmp", "atlas-warden-"));
    roots.push(root);
    writeFileSync(join(root, "policy.yaml"), "command: [node]\n");
    const service = new WardenService({ resolveBinary: () => "/usr/local/bin/warden" });
    const plan = service.plan({
      policyPath: "policy.yaml",
      command: "node",
      args: ["server.js", "--label=not shell; syntax"],
      cwd: root,
    });
    expect(plan.binary).toBe("/usr/local/bin/warden");
    expect(plan.args).toEqual([
      "run",
      "--policy",
      join(root, "policy.yaml"),
      "--",
      "node",
      "server.js",
      "--label=not shell; syntax",
    ]);
    expect(() => service.plan({ policyPath: "missing.yaml", command: "node", cwd: root })).toThrow(
      "policy does not exist",
    );
  });

  it("fails closed when Warden is unavailable", () => {
    const service = new WardenService({ resolveBinary: () => null });
    expect(() => service.plan({ policyPath: "policy.yaml", command: "node" })).toThrow(
      "not installed",
    );
  });
});
