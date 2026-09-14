export type AtlasSectionStatus = "ready" | "pending" | "warning" | "blocked";

export interface AtlasCompletionInput {
  readonly toolsInstalled: number;
  readonly skillsInstalled: number;
  readonly warden: "enabled" | "available" | "not-installed";
  readonly blockers?: readonly string[];
}

export interface AtlasCompletion {
  readonly ready: boolean;
  readonly banner: string;
  readonly tools: {
    readonly status: AtlasSectionStatus;
    readonly installed: number;
  };
  readonly skills: {
    readonly status: AtlasSectionStatus;
    readonly installed: number;
  };
  readonly security: {
    readonly status: AtlasSectionStatus;
    readonly warden: "enabled" | "available" | "not-installed";
  };
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

/** Build the shared, factual TOOLS/SKILLS/SECURITY completion summary. */
export function createAtlasCompletion(input: AtlasCompletionInput): AtlasCompletion {
  const blockers = [...(input.blockers ?? [])];
  const warnings: string[] = [];
  const securityStatus: AtlasSectionStatus =
    input.warden === "enabled" ? "ready" : input.warden === "available" ? "warning" : "warning";
  if (input.warden === "not-installed") {
    warnings.push("Warden is not installed; sandboxed MCP execution is unavailable.");
  } else if (input.warden === "available") {
    warnings.push("Warden is available but remains opt-in until an explicit sandboxed run.");
  }
  const ready = blockers.length === 0;
  return {
    ready,
    banner: ready ? "ATLAS READY" : "ATLAS SETUP INCOMPLETE",
    tools: {
      status: ready ? "ready" : input.toolsInstalled > 0 ? "warning" : "pending",
      installed: input.toolsInstalled,
    },
    skills: {
      status: ready ? "ready" : input.skillsInstalled > 0 ? "warning" : "pending",
      installed: input.skillsInstalled,
    },
    security: { status: securityStatus, warden: input.warden },
    blockers,
    warnings,
  };
}
