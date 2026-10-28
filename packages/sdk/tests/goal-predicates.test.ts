import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ProofSDK, createProofSDK } from "../src/proof";

const roots: string[] = [];
const engines: ProofSDK[] = [];
afterEach(async () => {
  for (const sdk of engines.splice(0)) sdk.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Expected ${name}`);
  return value;
}

describe("read-only goal predicates", () => {
  it("executes text-present and TS-family symbol-exists through the existing verify path", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-goal-predicate-"));
    roots.push(root);
    await writeFile(join(root, "a.ts"), "export function answer() { return 42; }\n");
    const sdk = await createProofSDK({ repositoryPath: root });
    engines.push(sdk);

    const started = await sdk.begin({
      goal: "Answer symbol remains present",
      proposals: [
        {
          key: "present",
          kind: "ProofObligation",
          statement: "Literal export remains",
          minimumLevel: 1,
          action: {
            kind: "text-present",
            paths: ["a.ts"],
            target: "export function answer",
          },
        },
        {
          key: "symbol",
          kind: "ProofObligation",
          statement: "Answer symbol exists",
          minimumLevel: 1,
          action: { kind: "symbol-exists", paths: ["a.ts"], target: "answer" },
        },
        {
          key: "goal",
          kind: "Requirement",
          statement: "Answer remains",
          minimumLevel: 1,
          dependsOn: ["present", "symbol"],
        },
      ],
    });
    const present = required(
      started.session.nodes.find((node) => node.action?.kind === "text-present"),
      "text-present node",
    );
    const symbol = required(
      started.session.nodes.find((node) => node.action?.kind === "symbol-exists"),
      "symbol-exists node",
    );

    const afterPresent = await sdk.verify(started.session.id, present.id);
    expect(afterPresent.session.evidence.at(-1)).toMatchObject({
      nodeId: present.id,
      result: "pass",
      outcomeKind: "text-present",
      level: 1,
    });
    const afterSymbol = await sdk.verify(started.session.id, symbol.id);
    expect(afterSymbol.session.evidence.at(-1)).toMatchObject({
      nodeId: symbol.id,
      result: "pass",
      outcomeKind: "symbol-exists",
      level: 1,
    });
    const requirement = required(
      started.session.nodes.find((node) => node.kind === "Requirement"),
      "requirement node",
    );
    expect(afterSymbol.nodes.find((node) => node.nodeId === requirement.id)?.status).toBe(
      "supported",
    );
  });

  it("reports a missing symbol as falsified without claiming dynamic absence", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-goal-predicate-"));
    roots.push(root);
    await writeFile(join(root, "a.ts"), "export const other = 1;\n");
    const sdk = await createProofSDK({ repositoryPath: root });
    engines.push(sdk);

    const started = await sdk.begin({
      goal: "Missing symbol is not asserted",
      proposals: [
        {
          key: "symbol",
          kind: "ProofObligation",
          statement: "Missing symbol exists",
          minimumLevel: 1,
          action: { kind: "symbol-exists", paths: ["a.ts"], target: "answer" },
        },
        {
          key: "goal",
          kind: "Requirement",
          statement: "Symbol",
          minimumLevel: 1,
          dependsOn: ["symbol"],
        },
      ],
    });
    const node = required(
      started.session.nodes.find((item) => item.action?.kind === "symbol-exists"),
      "symbol-exists node",
    );
    const report = await sdk.verify(started.session.id, node.id);
    expect(report.session.evidence.at(-1)).toMatchObject({
      result: "fail",
      outcomeKind: "symbol-exists",
    });
    expect(report.session.evidence.at(-1)?.derivation).toContain("dynamic");
  });
});
