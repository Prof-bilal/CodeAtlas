import type { BehavioralDifferential, ChangeSession } from "@prof-bilal/atlas-core";

/**
 * Conservative, structural differential. It never claims semantic equivalence:
 * `unchanged` is deliberately unreachable without paired evidence on both sides,
 * which the current session document does not retain. The default is `unknown`.
 */
export function behavioralDifferential(session: ChangeSession): BehavioralDifferential {
  const scope = [
    ...new Set([
      ...(session.goalContract?.preserveContracts.map((preserve) => preserve.artifact) ?? []),
      ...(session.goalContract?.criteria
        .flatMap((criterion) => criterion.obligationIds)
        .flatMap((id) => session.nodes.find((node) => node.id === id)?.action?.paths ?? []) ?? []),
      ...session.current.artifacts
        .filter((artifact) => {
          const before = session.baseline.artifacts.find((item) => item.path === artifact.path);
          return !before || before.hash !== artifact.hash;
        })
        .map((artifact) => artifact.path),
    ]),
  ].sort();
  const changes: BehavioralDifferential["changes"][number][] = [];
  const before = new Map(session.baseline.artifacts.map((artifact) => [artifact.path, artifact]));
  const after = new Map(session.current.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const path of scope) {
    const old = before.get(path);
    const next = after.get(path);
    const oldContracts = new Map((old?.contracts ?? []).map((contract) => [contract.id, contract]));
    const nextContracts = new Map(
      (next?.contracts ?? []).map((contract) => [contract.id, contract]),
    );
    for (const id of new Set([...oldContracts.keys(), ...nextContracts.keys()])) {
      const oldHash = oldContracts.get(id)?.hash;
      const nextHash = nextContracts.get(id)?.hash;
      if (oldHash === nextHash) continue;
      changes.push({
        artifact: path,
        kind: "contract",
        before: oldHash ?? "absent",
        after: nextHash ?? "absent",
      });
    }
  }
  const limitations = [
    "Structural differential only: exported syntax contracts on both sides. No semantic-equivalence claim.",
    "Test and runtime outcome deltas require paired baseline/current evidence; this session stores one evidence set, so those deltas remain unknown.",
  ];
  if (!session.current.complete) limitations.push("Repository observation is incomplete.");
  return {
    status: changes.length ? "changed" : "unknown",
    scope,
    changes,
    limitations,
  };
}
