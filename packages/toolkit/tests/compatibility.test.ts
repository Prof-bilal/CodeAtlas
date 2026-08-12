import type {
  AgentInfo,
  AgentPort,
  AgentRunRequest,
  AgentRunResult,
  CompatibilityEvaluationInput,
  CompatibilityRequirements,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { CompatibilityEngineService } from "../src/compatibility.service";
import { EnvironmentDetector } from "../src/environment";

/** An in-memory `AgentPort` so no binary is ever probed. */
class StubAgentPort implements AgentPort {
  public readonly defaultProvider = "claude";
  private readonly available: Readonly<Record<string, string | undefined>>;

  public constructor(available: Readonly<Record<string, string | undefined>>) {
    this.available = available;
  }

  public listAgents(): readonly string[] {
    return Object.keys(this.available);
  }

  public async detectAgent(provider: string): Promise<Result<AgentInfo>> {
    const version = this.available[provider];
    if (version === undefined) {
      return ok({ provider, binary: provider, available: false });
    }
    return ok({ provider, binary: provider, available: true, version });
  }

  public async detectAll(): Promise<Result<readonly AgentInfo[]>> {
    return ok(
      Object.entries(this.available).map(([provider, version]) => ({
        provider,
        binary: provider,
        available: version !== undefined,
        ...(version === undefined ? {} : { version }),
      })),
    );
  }

  public async run(_request: AgentRunRequest): Promise<Result<AgentRunResult>> {
    throw new Error("run() must not be called by the Compatibility Engine");
  }
}

function detector(
  overrides: Partial<ConstructorParameters<typeof EnvironmentDetector>[0]> = {},
): EnvironmentDetector {
  return new EnvironmentDetector({
    platform: "win32",
    arch: "x64",
    nodeVersion: "v22.14.0",
    findExecutable: (binary) =>
      binary === "node" || binary === "npm" ? `C:\\bin\\${binary}.exe` : null,
    readVersion: (_binary, _args) => null,
    ...overrides,
  });
}

function engine(agents: AgentPort, environment: EnvironmentDetector): CompatibilityEngineService {
  return new CompatibilityEngineService({ agentPort: agents, environment });
}

function input(
  requirements: Partial<CompatibilityRequirements> = {},
  installMethod: CompatibilityEvaluationInput["installMethod"] = null,
): CompatibilityEvaluationInput {
  return {
    toolName: "fixture-tool",
    toolVersion: "1.2.3",
    requirements: {
      os: [],
      runtimes: [],
      agents: [],
      mcp: false,
      architecture: [],
      permissions: [],
      ...requirements,
    },
    installMethod,
  };
}

describe("CompatibilityEngineService", () => {
  it("reports compatible when nothing is declared", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(input());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.overall).toBe("compatible");
    expect(result.value.notInstallable).toBe(false);
    expect(result.value.checks.length).toBeGreaterThan(0);
  });

  it("fails closed on an incompatible OS", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ os: ["darwin"] }),
    );
    expect(result.ok && result.value.overall).toBe("incompatible");
    if (!result.ok) {
      return;
    }
    expect(result.value.notInstallable).toBe(true);
    const osCheck = result.value.checks.find((check) => check.id === "os");
    expect(osCheck?.state).toBe("incompatible");
  });

  it("normalizes OS aliases (windows → win32, macos → darwin)", async () => {
    const windows = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ os: ["windows"] }),
    );
    expect(windows.ok && windows.value.overall).toBe("compatible");
    const mac = await engine(new StubAgentPort({}), detector({ platform: "darwin" })).evaluate(
      input({ os: ["macos"] }),
    );
    expect(mac.ok && mac.value.overall).toBe("compatible");
  });

  it("normalizes architecture aliases (x86_64 → x64)", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ architecture: ["x86_64"] }),
    );
    expect(result.ok && result.value.overall).toBe("compatible");
  });

  it("flags a missing runtime as incompatible", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ runtimes: [{ name: "python", versionRange: ">=3.11" }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const runtimes = result.value.checks.find((check) => check.id === "runtimes");
    expect(runtimes?.state).toBe("incompatible");
    expect(runtimes?.subChecks?.[0].state).toBe("incompatible");
    expect(result.value.overall).toBe("incompatible");
  });

  it("matches a runtime version range against the detected Node version", async () => {
    const compatible = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ runtimes: [{ name: "node", versionRange: ">=20.19.0" }] }),
    );
    expect(compatible.ok && compatible.value.overall).toBe("compatible");
    const tooOld = await engine(
      new StubAgentPort({}),
      detector({ nodeVersion: "v18.0.0" }),
    ).evaluate(input({ runtimes: [{ name: "node", versionRange: ">=20.19.0" }] }));
    expect(tooOld.ok && tooOld.value.overall).toBe("incompatible");
  });

  it("flags unknown when a runtime version cannot be parsed", async () => {
    const result = await engine(
      new StubAgentPort({}),
      detector({
        readVersion: (_binary, _args) => "banana",
        findExecutable: (binary) => (binary === "go" ? "/usr/local/bin/go" : null),
      }),
    ).evaluate(input({ runtimes: [{ name: "go", versionRange: ">=1.22" }] }));
    expect(result.ok && result.value.overall).toBe("unknown");
    expect(result.ok && result.value.notInstallable).toBe(false);
  });

  it("reports agent availability through AgentPort", async () => {
    const agents = new StubAgentPort({ claude: "2.0.1", gemini: undefined });
    const result = await engine(agents, detector()).evaluate(
      input({ agents: ["claude", "gemini"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const agentsCheck = result.value.checks.find((check) => check.id === "agents");
    expect(agentsCheck?.state).toBe("partially-compatible");
    const subStates = agentsCheck?.subChecks?.map((sub) => sub.state) ?? [];
    expect(subStates).toEqual(["compatible", "incompatible"]);
    expect(result.value.overall).toBe("partially-compatible");
    expect(result.value.notInstallable).toBe(false);
  });

  it("reports an unregistered agent as not found (incompatible)", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ agents: ["codex"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const agentsCheck = result.value.checks.find((check) => check.id === "agents");
    expect(agentsCheck?.state).toBe("incompatible");
    expect(result.value.overall).toBe("incompatible");
  });

  it("returns unknown when the agent port cannot determine availability", async () => {
    const failing = new (class implements AgentPort {
      public readonly defaultProvider = "claude";
      public listAgents(): readonly string[] {
        return ["claude"];
      }
      public async detectAgent(): Promise<Result<AgentInfo>> {
        return { ok: false, error: new Error("provider probe crashed") };
      }
      public async detectAll(): Promise<Result<readonly AgentInfo[]>> {
        return { ok: false, error: new Error("provider probe crashed") };
      }
      public async run(_request: AgentRunRequest): Promise<Result<AgentRunResult>> {
        throw new Error("run() must not be called by the Compatibility Engine");
      }
    })();
    const result = await engine(failing, detector()).evaluate(input({ agents: ["claude"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const agentsCheck = result.value.checks.find((check) => check.id === "agents");
    expect(agentsCheck?.state).toBe("unknown");
    expect(result.value.overall).toBe("unknown");
    expect(result.value.notInstallable).toBe(false);
  });

  it("checks the package manager for declared install methods", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(input({}, "npm"));
    expect(result.ok && result.value.overall).toBe("compatible");
    const missing = await engine(new StubAgentPort({}), detector()).evaluate(input({}, "pip"));
    expect(missing.ok && missing.value.overall).toBe("incompatible");
  });

  it("skips the package-manager check for binary installs", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(input({}, "binary"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.checks.some((check) => check.id === "package-manager")).toBe(false);
    expect(result.value.overall).toBe("compatible");
  });

  it("reports declared permissions as advisory without downgrading", async () => {
    const result = await engine(new StubAgentPort({}), detector()).evaluate(
      input({ permissions: ["network", "processes"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const permissions = result.value.checks.find((check) => check.id === "permissions");
    expect(permissions?.advisory).toBe(true);
    expect(permissions?.state).toBe("unknown");
    expect(result.value.overall).toBe("compatible");
  });

  it("requires Node.js when the tool needs MCP", async () => {
    const withNode = await engine(new StubAgentPort({}), detector()).evaluate(input({ mcp: true }));
    expect(withNode.ok).toBe(true);
    if (!withNode.ok) {
      return;
    }
    expect(withNode.value.checks.find((check) => check.id === "mcp")?.state).toBe("compatible");
    expect(withNode.value.overall).toBe("compatible");

    const noNode = await engine(
      new StubAgentPort({}),
      detector({ findExecutable: () => null }),
    ).evaluate(input({ mcp: true }));
    expect(noNode.ok && noNode.value.overall).toBe("incompatible");
    expect(noNode.ok && noNode.value.notInstallable).toBe(true);
  });

  it("requires an AgentPort", () => {
    expect(
      () =>
        new CompatibilityEngineService({
          environment: detector(),
        } as never),
    ).toThrow(/AgentPort/);
  });
});
