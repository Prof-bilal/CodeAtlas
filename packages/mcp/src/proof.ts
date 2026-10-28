import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type ApprovedProofCommand,
  type ProofPort,
  type ProofProposal,
  type ProofReport,
  type ProofSDK,
  type ProofSDKOptions,
  buildWorkPacket,
  createProofSDK,
  denyFilter,
} from "@prof-bilal/atlas-sdk";
import { z } from "zod";
import type { ToolCallBudget } from "./budget";
import type { CodeAtlasContext } from "./context";

export const PROOF_TOOL_NAMES = [
  "atlas_begin_change",
  "atlas_understand",
  "atlas_context",
  "atlas_check",
  "atlas_status",
  "atlas_verify",
  "atlas_prove",
] as const;
const action = z
  .object({
    kind: z.enum([
      "artifact-exists",
      "text-absent",
      "text-present",
      "symbol-exists",
      "command",
      "runtime-probe",
      "public-contract-unchanged",
    ]),
    paths: z.array(z.string().min(1).max(1000)).max(64),
    target: z.string().min(1).max(1000),
  })
  .strict();
const proposal = z
  .object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    kind: z.enum([
      "Requirement",
      "Constraint",
      "Invariant",
      "Claim",
      "Assumption",
      "Unknown",
      "ProofObligation",
    ]),
    statement: z.string().trim().min(1).max(10000),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
    minimumLevel: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .optional(),
    dependsOn: z.array(z.string().max(128)).max(128).optional(),
    action: action.optional(),
  })
  .strict();
const changeId = z.string().regex(/^[a-f0-9]{32}$/);

/** Compact projection: snapshots stay on disk and are never dumped into model context. */
function project(report: ProofReport) {
  return {
    changeId: report.session.id,
    version: report.session.version,
    state: report.session.state,
    revision: report.session.current.id,
    baselineRevision: report.session.baseline.id,
    nodes: report.session.nodes.map((n) => ({
      ...n,
      ...report.nodes.find((s) => s.nodeId === n.id),
    })),
    debt: report.debt,
    changedArtifacts: report.changedArtifacts,
    semanticChanges: report.semanticChanges,
    unjustifiedMutations: report.unjustifiedMutations,
    blindspots: report.blindspots,
    nextActions: report.nextActions,
    guaranteeCeiling: report.guaranteeCeiling,
    limitations: report.session.current.limitations,
    proposed: report.session.proposed ?? [],
    contractChanges: report.contractChanges,
    goalStatus: report.goal?.status ?? "UNDETERMINED",
    goal: report.goal
      ? {
          status: report.goal.status,
          contractVersion: report.goal.contract?.version ?? null,
          criteria: report.goal.criteria,
          testStatus: report.goal.testStatus,
          proofStatus: report.goal.proofStatus,
          intentDebt: report.goal.intentDebt,
          coverage: report.goal.coverage,
          ceiling: report.goal.ceiling,
          blockers: report.goal.blockers,
          blindspots: report.goal.blindspots ?? [],
          drifts: report.goal.drifts ?? [],
          conflicts: report.goal.conflicts ?? [],
          limitations: report.goal.limitations,
        }
      : null,
  };
}

/** Explicit proof profile: seven tools, existing context profile remains compatible. */
export function registerProofTools(
  server: McpServer,
  context: CodeAtlasContext,
  commands: Readonly<Record<string, ApprovedProofCommand>> = {},
  budget?: ToolCallBudget,
  sdkOptions: Omit<ProofSDKOptions, "repositoryPath" | "commands"> = {},
): () => Promise<void> {
  let sdk: Promise<ProofSDK> | undefined;
  let stopWatching: (() => Promise<void>) | undefined;
  let closed = false;
  const get = () => {
    if (closed) throw new Error("Proof server is closed.");
    if (!sdk) {
      sdk = createProofSDK({ ...sdkOptions, repositoryPath: context.root, commands }).then(
        async (service) => {
          try {
            const watcher = await service.watch();
            stopWatching = () => watcher.close();
            return service;
          } catch (error) {
            service.close();
            throw error;
          }
        },
      );
    }
    return sdk;
  };
  const register = (
    name: string,
    description: string,
    schema: Record<string, z.ZodType>,
    fn: (args: Record<string, unknown>) => Promise<unknown>,
    readonly: boolean,
  ) => {
    server.registerTool(
      name,
      {
        title: name.replaceAll("_", " "),
        description,
        inputSchema: schema,
        outputSchema: { result: z.object({}).passthrough(), nextSteps: z.array(z.string()) },
        annotations: {
          readOnlyHint: readonly,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async (args) => {
        const started = performance.now();
        const permitted = budget?.check(name);
        if (permitted && !permitted.allowed)
          return {
            isError: true,
            content: [
              { type: "text" as const, text: permitted.reason ?? "Proof tool budget exhausted." },
            ],
          };
        budget?.record(name, 0);
        try {
          const result = {
            result: await fn(args),
            nextSteps: ["Resolve critical/high proof debt and rerun atlas_prove after mutations."],
          };
          if (JSON.stringify(result).length > 100000)
            throw new Error("Proof response exceeds budget; narrow the change session.");
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Proof operation failed.";
          const message = denyFilter("proof-error.txt", detail).accepted
            ? detail.replaceAll(context.root, "<repo>")
            : "Proof operation failed; sensitive details omitted.";
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: message,
              },
            ],
          };
        } finally {
          context.recordMcpRequest(Math.round(performance.now() - started));
        }
      },
    );
  };
  register(
    "atlas_begin_change",
    "Begin a durable change session with explicit requirements, authorized artifact paths and repository baseline. Proposals alone never establish proof.",
    {
      goal: z.string().trim().min(1).max(10000).optional(),
      portableState: z.record(z.unknown()).optional(),
      boundary: z.array(z.string().max(1000)).max(64).optional(),
      authorizedPaths: z.array(z.string().max(1000)).max(64).optional(),
      semanticChangeBudget: z.number().int().min(0).max(10000).optional(),
      proposals: z.array(proposal).max(128).optional(),
      goalContract: z.record(z.unknown()).optional(),
      proposedGoal: z.record(z.unknown()).optional(),
      investigationRules: z
        .array(
          z
            .object({
              triggerPaths: z.array(z.string().max(1000)).max(64),
              expectedPaths: z.array(z.string().max(1000)).max(64),
              reason: z.string().min(1).max(1000),
            })
            .strict(),
        )
        .max(64)
        .optional(),
    },
    async (args) =>
      args["portableState"]
        ? project(await (await get()).importState(args["portableState"]))
        : project(await (await get()).begin(args as unknown as Parameters<ProofPort["begin"]>[0])),
    false,
  );
  register(
    "atlas_understand",
    "Compile or revise explicit requirement and obligation proposals. New versions reopen prior proof. Returns unresolved work and verification actions.",
    {
      changeId,
      proposals: z.array(proposal).max(128).optional(),
      goalDraft: z.record(z.unknown()).optional(),
      adoptGoal: z
        .object({
          approved: z.literal(true),
          criterionKeys: z.array(z.string().min(1).max(80)).min(1).max(64),
          outcomeKeys: z.array(z.string().min(1).max(80)).max(128).optional(),
          decisions: z
            .array(
              z
                .object({ key: z.string().min(1).max(1000), reason: z.string().min(1).max(1000) })
                .strict(),
            )
            .max(32)
            .optional(),
        })
        .strict()
        .optional(),
      dismissGoal: z
        .array(
          z
            .object({ key: z.string().min(1).max(80), reason: z.string().min(1).max(1000) })
            .strict(),
        )
        .min(1)
        .max(32)
        .optional(),
      propose: z.boolean().optional(),
      approved: z.boolean().optional(),
      dismissals: z
        .array(
          z
            .object({ key: z.string().min(1).max(80), reason: z.string().min(1).max(1000) })
            .strict(),
        )
        .max(32)
        .optional(),
      justifications: z
        .array(
          z
            .object({
              paths: z.array(z.string().max(1000)).max(64),
              nodeId: z.string().regex(/^[a-f0-9]{64}$/),
              reason: z.string().min(1).max(1000),
              kind: z.enum([
                "requirement",
                "constraint",
                "invariant",
                "bug",
                "refactor",
                "dependency",
              ]),
            })
            .strict(),
        )
        .max(128)
        .optional(),
    },
    async (args) => {
      const service = await get();
      const id = String(args["changeId"]);
      if (args["dismissGoal"]) {
        return project(
          await service.dismissGoal(
            id,
            args["dismissGoal"] as Parameters<ProofSDK["dismissGoal"]>[1],
          ),
        );
      }
      if (args["adoptGoal"]) {
        if (args["goalDraft"]) await service.stageGoalDraft(id, args["goalDraft"] as never);
        return project(
          await service.adoptGoal(id, args["adoptGoal"] as Parameters<ProofSDK["adoptGoal"]>[1]),
        );
      }
      if (args["goalDraft"]) {
        await service.stageGoalDraft(id, args["goalDraft"] as never);
        return project(await service.check(id));
      }
      if (args["dismissals"]) {
        if (args["approved"] !== true)
          throw new Error("Proposal dismissal requires explicit approval.");
        return project(
          await service.dismissProposals(
            id,
            args["dismissals"] as Parameters<ProofPort["dismissProposals"]>[1],
          ),
        );
      }
      if (args["propose"] === true)
        return { proposals: await service.propose(id, { approved: args["approved"] === true }) };
      if (args["justifications"]) {
        if (args["approved"] !== true)
          throw new Error("Mutation authorization requires explicit approval.");
        return project(
          await service.authorize(
            id,
            args["justifications"] as Parameters<ProofPort["authorize"]>[1],
          ),
        );
      }
      if (!args["proposals"])
        throw new Error("Provide proposals or explicitly request model proposals.");
      return project(
        await (await get()).understand(
          String(args["changeId"]),
          args["proposals"] as ProofProposal[],
        ),
      );
    },
    false,
  );
  register(
    "atlas_context",
    "Build bounded source context for unresolved proof work. Uses existing WorkPacket selection, safety filters and token budgeting.",
    { changeId, maxTokens: z.number().int().min(512).max(12000).optional() },
    async (args) => {
      const report = await (await get()).check(String(args["changeId"]));
      context.close();
      const task = `${report.session.goal}\n${[
        ...(report.goal?.intentDebt.slice(0, 6).map((d) => d.reason) ?? []),
        ...report.debt.slice(0, 8).map((d) => d.reason),
      ]
        .join("\n")
        .slice(0, 10000)}`;
      return {
        proof: project(report),
        packet: await buildWorkPacket(context.requireSDK(), {
          task,
          maxTokens: Number(args["maxTokens"] ?? 4000),
        }),
      };
    },
    false,
  );
  for (const name of ["atlas_check", "atlas_status"])
    register(
      name,
      "Observe repository mutations, invalidate stale evidence and propagate reopened proof obligations. Returns debt, blindspots and the next verification actions.",
      {
        changeId,
        exportState: z.boolean().optional(),
        historyAfter: z.number().int().min(0).optional(),
        agentMiss: z
          .object({
            paths: z.array(z.string().min(1).max(1000)).min(2).max(40),
            reason: z.string().min(1).max(1000),
          })
          .strict()
          .optional(),
      },
      async (args) => {
        const service = await get();
        const id = String(args["changeId"]);
        if (args["agentMiss"]) {
          const miss = args["agentMiss"] as { paths: string[]; reason: string };
          await service.recordAgentMiss(id, miss.paths, miss.reason);
        }
        if (args["exportState"] === true) return { portableState: await service.exportState(id) };
        if (typeof args["historyAfter"] === "number")
          return {
            history: (await service.history(id, args["historyAfter"], 10)).map((entry) => ({
              version: entry.version,
              revision: entry.session.current.id,
              nodes: entry.session.nodes.map((n) => ({
                id: n.id,
                version: n.version,
                statement: n.statement,
              })),
            })),
          };
        return project(await service.check(id));
      },
      false,
    );
  register(
    "atlas_verify",
    "Execute an explicit verification action. Commands must be pre-approved by server configuration; tool input cannot supply a command or passing verdict.",
    { changeId, nodeId: z.string().regex(/^[a-f0-9]{64}$/) },
    async (args) =>
      project(await (await get()).verify(String(args["changeId"]), String(args["nodeId"]))),
    false,
  );
  register(
    "atlas_prove",
    "Refresh evidence and apply the completion gate. Critical/high debt, stale proof and contradictions prevent a proven receipt.",
    { changeId },
    async (args) => (await get()).prove(String(args["changeId"])),
    false,
  );
  return async () => {
    if (closed) return;
    closed = true;
    const service = await sdk?.catch(() => undefined);
    await stopWatching?.();
    service?.close();
  };
}
