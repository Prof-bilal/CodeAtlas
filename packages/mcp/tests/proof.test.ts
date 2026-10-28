import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { PROOF_TOOL_NAMES } from "../src/proof";
import { createMcpServer } from "../src/server";
import { silentLogger } from "./fixture";

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Expected ${name}`);
  return value;
}

describe("proof MCP profile", () => {
  it("stages and adopts goal intent without adding a tool", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-mcp-goal-"));
    await writeFile(join(root, "a.ts"), "export const a = 1;");
    const server = createMcpServer({ root, toolProfile: "proof", logger: silentLogger() });
    const client = new Client({ name: "goal-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(7);
      const begin = await client.callTool({
        name: "atlas_begin_change",
        arguments: {
          goal: "No JWT literals",
          proposals: [
            {
              key: "absence",
              kind: "ProofObligation",
              statement: "Literal JWT absent",
              minimumLevel: 1,
              action: { kind: "text-absent", paths: ["."], target: "JWT" },
            },
            {
              key: "goal",
              kind: "Requirement",
              statement: "Literal JWT absent",
              minimumLevel: 1,
              dependsOn: ["absence"],
            },
          ],
        },
      });
      expect(begin.isError).not.toBe(true);
      const started = (
        begin.structuredContent as {
          result: { changeId: string; nodes: { id: string; action?: { kind: string } }[] };
        }
      ).result;
      const node = required(
        started.nodes.find((item) => item.action?.kind === "text-absent"),
        "text-absent node",
      );
      const draft = {
        schemaVersion: 1,
        goal: "No JWT literals",
        desiredOutcomes: [
          {
            key: "no-jwt",
            statement: "Literal JWT absent",
            priority: "MUST",
            criterionKeys: ["absence"],
          },
        ],
        criteria: [
          {
            key: "absence",
            statement: "Literal JWT absent from the observed scope",
            assertion: "literal-absence",
            outcomeKeys: ["no-jwt"],
            evidenceKinds: ["text-absent"],
          },
        ],
        preserveCandidates: [],
        forbiddenCandidates: [],
        nonGoals: [],
        openQuestions: [],
        limitations: [],
      };
      const adopted = await client.callTool({
        name: "atlas_understand",
        arguments: {
          changeId: started.changeId,
          goalDraft: draft,
          adoptGoal: { approved: true, criterionKeys: ["absence"] },
        },
      });
      expect(adopted.isError).not.toBe(true);
      expect(
        (adopted.structuredContent as { result: { goalStatus: string } }).result.goalStatus,
      ).toBe("UNDETERMINED");

      const verified = await client.callTool({
        name: "atlas_verify",
        arguments: { changeId: started.changeId, nodeId: node.id },
      });
      expect(verified.isError).not.toBe(true);
      const status = await client.callTool({
        name: "atlas_status",
        arguments: { changeId: started.changeId },
      });
      expect(
        (status.structuredContent as { result: { goalStatus: string } }).result.goalStatus,
      ).toBe("SATISFIED");
      const receipt = await client.callTool({
        name: "atlas_prove",
        arguments: { changeId: started.changeId },
      });
      expect(receipt.isError).not.toBe(true);
      expect(
        (receipt.structuredContent as { result: { goalStatus: string } }).result.goalStatus,
      ).toBe("SATISFIED");
      expect(
        (receipt.structuredContent as { result: { completion: string } }).result.completion,
      ).toBe("proven");

      const restaged = await client.callTool({
        name: "atlas_understand",
        arguments: { changeId: started.changeId, goalDraft: draft },
      });
      expect(restaged.isError).not.toBe(true);
      const dismissed = await client.callTool({
        name: "atlas_understand",
        arguments: {
          changeId: started.changeId,
          dismissGoal: [{ key: "absence", reason: "The criterion is not falsifiable here." }],
        },
      });
      expect(dismissed.isError).not.toBe(true);
    } finally {
      await client.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("advertises seven tools, propagates mutation and rejects invented results", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-mcp-proof-"));
    await writeFile(join(root, "a.ts"), "export const a = 1;");
    const server = createMcpServer({ root, toolProfile: "proof", logger: silentLogger() });
    const client = new Client({ name: "proof-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name)).toEqual([...PROOF_TOOL_NAMES]);
      expect(listed.tools.every((t) => t.annotations?.readOnlyHint === false)).toBe(true);
      const begin = await client.callTool({
        name: "atlas_begin_change",
        arguments: {
          goal: "No JWT literals",
          authorizedPaths: ["."],
          proposals: [
            {
              key: "absence",
              kind: "ProofObligation",
              statement: "Literal JWT absent",
              minimumLevel: 1,
              action: { kind: "text-absent", paths: ["."], target: "JWT" },
            },
            {
              key: "goal",
              kind: "Requirement",
              statement: "Literal JWT absent",
              minimumLevel: 1,
              dependsOn: ["absence"],
            },
          ],
        },
      });
      expect(begin.isError).not.toBe(true);
      const result = (
        begin.structuredContent as { result: { changeId: string; nodes: { id: string }[] } }
      ).result;
      const verified = await client.callTool({
        name: "atlas_verify",
        arguments: { changeId: result.changeId, nodeId: result.nodes[0].id },
      });
      expect(verified.isError).not.toBe(true);
      const receipt = await client.callTool({
        name: "atlas_prove",
        arguments: { changeId: result.changeId },
      });
      expect(
        (receipt.structuredContent as { result: { completion: string } }).result.completion,
      ).toBe("proven");
      await writeFile(join(root, "a.ts"), "export const a = 'JWT';");
      const stale = await client.callTool({
        name: "atlas_status",
        arguments: { changeId: result.changeId },
      });
      expect(
        (stale.structuredContent as { result: { nodes: { status: string }[] } }).result.nodes.every(
          (n) => n.status === "stale",
        ),
      ).toBe(true);
      const invalid = await client.callTool({
        name: "atlas_begin_change",
        arguments: {
          goal: "x",
          proposals: [{ key: "x", kind: "Requirement", statement: "done", status: "supported" }],
        },
      });
      expect(invalid.isError).toBe(true);
      const exported = await client.callTool({
        name: "atlas_status",
        arguments: { changeId: result.changeId, exportState: true },
      });
      expect(exported.isError).not.toBe(true);
      const portableState = (exported.structuredContent as { result: { portableState: unknown } })
        .result.portableState;
      const imported = await client.callTool({
        name: "atlas_begin_change",
        arguments: { portableState },
      });
      expect(imported.isError).not.toBe(true);
      const rebound = (
        imported.structuredContent as { result: { changeId: string; nodes: { status: string }[] } }
      ).result;
      expect(rebound.changeId).not.toBe(result.changeId);
      expect(rebound.nodes.every((n) => n.status === "unproven")).toBe(true);
      const history = await client.callTool({
        name: "atlas_status",
        arguments: { changeId: result.changeId, historyAfter: 0 },
      });
      expect(
        (history.structuredContent as { result: { history: unknown[] } }).result.history.length,
      ).toBeGreaterThan(1);
      const unapproved = await client.callTool({
        name: "atlas_understand",
        arguments: { changeId: result.changeId, propose: true, approved: false },
      });
      expect(unapproved.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
