import type {
  ChangeSession,
  Evidence,
  ProofDebtItem,
  ProofLevel,
  ProofNodeState,
  ProofReport,
  RepositoryRevision,
} from "@prof-bilal/atlas-core";
import { rankCoupling } from "./coupling";
import { evaluateGoalSatisfaction } from "./goal-truth";

export function inScope(path: string, scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`));
}

export function changedPaths(before: RepositoryRevision, after: RepositoryRevision): string[] {
  const old = new Map(before.artifacts.map((a) => [a.path, a.hash]));
  const current = new Map(after.artifacts.map((a) => [a.path, a.hash]));
  return [...new Set([...old.keys(), ...current.keys()])]
    .filter((p) => old.get(p) !== current.get(p))
    .sort();
}
/** Symmetric edge delta keeps unrelated topology changes out of independent proofs. */
function topologyChanges(before: RepositoryRevision, after: RepositoryRevision): string[] {
  const old = new Map(before.dependencies.map((e) => [JSON.stringify(e), e]));
  const current = new Map(after.dependencies.map((e) => [JSON.stringify(e), e]));
  const paths = new Set<string>();
  for (const key of new Set([...old.keys(), ...current.keys()]))
    if (!old.has(key) || !current.has(key)) {
      const edge = old.get(key) ?? current.get(key);
      if (!edge) continue;
      paths.add(edge.from);
      paths.add(edge.to);
    }
  return [...paths].sort();
}

/** Invalidates evidence monotonically. Returning to old content never revives an old run. */
export function invalidateEvidence(session: ChangeSession, next: RepositoryRevision): Evidence[] {
  const changed = new Set([
    ...changedPaths(session.current, next),
    ...topologyChanges(session.current, next),
  ]);
  // Include old AND new edges: deletion of a dependency must not lose its impact.
  const edges = [...session.current.dependencies, ...next.dependencies];
  const affected = new Set(changed);
  const reverse = new Map<string, string[]>();
  for (const edge of edges) {
    const key = edge.kind === "tested-by" ? edge.from : edge.to;
    const value = edge.kind === "tested-by" ? edge.to : edge.from;
    const list = reverse.get(key) ?? [];
    list.push(value);
    reverse.set(key, list);
  }
  const queue = [...changed];
  for (let i = 0; i < queue.length; i++) {
    for (const path of reverse.get(queue[i]) ?? []) {
      if (!affected.has(path)) {
        affected.add(path);
        queue.push(path);
      }
    }
  }
  return session.evidence.map((e) => {
    if (e.status === "stale") return e;
    const reasons = [...affected].filter((p) => inScope(p, e.scope));
    if (!next.complete) reasons.push("incomplete-observation");
    if (session.current.head !== next.head) reasons.push("git-head-changed");
    if (session.current.environmentId !== next.environmentId)
      reasons.push("verification-environment-changed");
    if (
      e.expiresAt &&
      (!Number.isFinite(Date.parse(e.expiresAt)) ||
        Date.parse(e.expiresAt) <= Date.parse(next.observedAt))
    )
      reasons.push("runtime-evidence-expired");
    if (reasons.length === 0) return e;
    return { ...e, status: "stale", validUntilRevision: next.id, invalidatedBy: reasons.sort() };
  });
}

/** Explicit AND dependencies; no dependency or evidence means unproven, never vacuous proof. */
export function evaluateProof(session: ChangeSession): ProofReport {
  const states = new Map<string, ProofNodeState>();
  const byId = new Map(session.nodes.map((n) => [n.id, n]));
  const latestEvidence = new Map<string, Evidence>();
  for (const evidence of session.evidence)
    latestEvidence.set(`${evidence.nodeId}:${evidence.nodeVersion}`, evidence);
  const visiting = new Set<string>();
  const evaluate = (id: string): ProofNodeState => {
    const cached = states.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return { nodeId: id, status: "unproven", level: 0 };
    visiting.add(id);
    const latest = latestEvidence.get(`${id}:${node.version}`);
    const deps = node.dependsOn.map(evaluate);
    let state: ProofNodeState = { nodeId: id, status: "unproven", level: 0 };
    if (
      (latest?.status === "fresh" && latest.result === "fail") ||
      deps.some((d) => d.status === "contradicted")
    ) {
      state = { nodeId: id, status: "contradicted", level: 0 };
    } else if (latest?.status === "stale" || deps.some((d) => d.status === "stale")) {
      state = { nodeId: id, status: "stale", level: 0 };
    } else {
      const levels: ProofLevel[] = deps.map((d) => d.level);
      if (latest?.status === "fresh" && latest.result === "pass") levels.push(latest.level);
      const hasSupport = node.action ? latest?.result === "pass" : deps.length > 0;
      const level = (levels.length ? Math.min(...levels) : 0) as ProofLevel;
      if (
        hasSupport &&
        session.current.complete &&
        deps.every((d) => d.status === "supported") &&
        level >= node.minimumLevel
      ) {
        state = { nodeId: id, status: "supported", level };
      }
    }
    visiting.delete(id);
    states.set(id, state);
    return state;
  };
  for (const node of session.nodes) evaluate(node.id);
  const debt: ProofDebtItem[] = session.nodes
    .filter((n) => states.get(n.id)?.status !== "supported")
    .map((n) => ({
      nodeId: n.id,
      severity: n.severity,
      reason: `${n.kind}: ${states.get(n.id)?.status ?? "unproven"}: ${n.statement}`,
    }));
  if (!session.current.complete)
    debt.push({
      nodeId: session.id,
      severity: "CRITICAL",
      reason: "Repository observation is incomplete.",
    });
  for (const proposal of session.proposed ?? [])
    debt.push({
      nodeId: `proposal:${proposal.key}`,
      severity: proposal.severity ?? "HIGH",
      reason: `Unreviewed compiler proposal: ${proposal.statement}`,
    });
  const changed = changedPaths(session.baseline, session.current);
  const oldArtifacts = new Map(session.baseline.artifacts.map((a) => [a.path, a]));
  const newArtifacts = new Map(session.current.artifacts.map((a) => [a.path, a]));
  const semanticChanges = changed.filter((path) => {
    const before = oldArtifacts.get(path);
    const after = newArtifacts.get(path);
    return (
      !before?.semanticHash || !after?.semanticHash || before.semanticHash !== after.semanticHash
    );
  });
  const contractChanges: ProofReport["contractChanges"][number][] = [];
  for (const path of semanticChanges) {
    const before = new Map((oldArtifacts.get(path)?.contracts ?? []).map((c) => [c.id, c]));
    const after = new Map((newArtifacts.get(path)?.contracts ?? []).map((c) => [c.id, c]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(id)?.hash === after.get(id)?.hash) continue;
      const contract = after.get(id) ?? before.get(id);
      if (!contract) continue;
      contractChanges.push({
        artifact: path,
        name: contract.name,
        change: !before.has(id) ? "added" : !after.has(id) ? "removed" : "changed",
      });
    }
  }
  const unjustified = changed.filter(
    (p) =>
      !inScope(p, session.boundary) ||
      (semanticChanges.includes(p) &&
        !inScope(p, session.authorizedPaths) &&
        !(session.justifications ?? []).some((j) => byId.has(j.nodeId) && inScope(p, j.paths))),
  );
  for (const path of unjustified)
    debt.push({
      nodeId: path,
      severity: "CRITICAL",
      reason: "UNJUSTIFIED MUTATION: outside authorized change boundary.",
    });
  if (semanticChanges.length > session.semanticChangeBudget)
    debt.push({
      nodeId: session.id,
      severity: "CRITICAL",
      reason: "Conservative semantic changed-file budget exceeded.",
    });
  const expected = new Map<string, string[]>();
  const topology = topologyChanges(session.baseline, session.current);
  for (const path of topology) expected.set(path, ["repository dependency topology changed"]);
  for (const rule of session.investigationRules ?? [])
    if (semanticChanges.some((path) => inScope(path, rule.triggerPaths)))
      for (const artifact of session.current.artifacts)
        if (inScope(artifact.path, rule.expectedPaths)) {
          const reasons = expected.get(artifact.path) ?? [];
          expected.set(artifact.path, [...reasons, `architecture rule: ${rule.reason}`]);
        }
  for (const path of semanticChanges) {
    const before = oldArtifacts.get(path)?.contracts;
    const after = newArtifacts.get(path)?.contracts;
    if (before && after && JSON.stringify(before) !== JSON.stringify(after))
      for (const edge of session.current.dependencies.filter((e) => e.to === path)) {
        const reasons = expected.get(edge.from) ?? [];
        expected.set(edge.from, [...reasons, `public contract changed in ${path}`]);
      }
  }
  for (const row of rankCoupling([...semanticChanges, ...topology], session.current.coupling ?? []))
    expected.set(row.artifact, [...(expected.get(row.artifact) ?? []), ...row.reasons]);
  const investigationEdges = new Map<string, { path: string; reason: string }[]>();
  for (const edge of [...session.baseline.dependencies, ...session.current.dependencies]) {
    const source = edge.kind === "tested-by" ? edge.from : edge.to;
    const path = edge.kind === "tested-by" ? edge.to : edge.from;
    const list = investigationEdges.get(source) ?? [];
    list.push({
      path,
      reason:
        edge.kind === "tested-by"
          ? `test associated with ${edge.from}`
          : `depends on ${edge.to} (${edge.kind})`,
    });
    investigationEdges.set(source, list);
  }
  const queue = [...new Set([...semanticChanges, ...topology])];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const candidate of investigationEdges.get(queue[i]) ?? []) {
      const reasons = expected.get(candidate.path) ?? [];
      if (!reasons.includes(candidate.reason))
        expected.set(candidate.path, [...reasons, candidate.reason]);
      if (!seen.has(candidate.path)) {
        seen.add(candidate.path);
        queue.push(candidate.path);
      }
    }
  }
  const blindspots = [...expected]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([artifact, reasons]) => ({
      artifact,
      risk: "HIGH" as const,
      reasons,
      investigated: session.evidence.some(
        (e) =>
          e.status === "fresh" &&
          e.result !== "unknown" &&
          inScope(artifact, e.investigatedPaths ?? []),
      ),
    }));
  for (const b of blindspots.filter((b) => !b.investigated))
    debt.push({
      nodeId: b.artifact,
      severity: "HIGH",
      reason: `Blindspot: ${b.reasons.join("; ")}`,
    });
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const consumers = new Map<string, string[]>();
  for (const n of session.nodes)
    for (const dep of n.dependsOn) {
      const ids = consumers.get(dep) ?? [];
      ids.push(n.id);
      consumers.set(dep, ids);
    }
  const settles = (seed: string): string[] => {
    const ids = [seed];
    const seen = new Set(ids);
    for (let i = 0; i < ids.length; i++)
      for (const id of consumers.get(ids[i]) ?? [])
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
    return ids;
  };
  const nextActions: ProofReport["nextActions"][number][] = session.nodes
    .filter((n) => states.get(n.id)?.status !== "supported")
    .flatMap((n) => {
      const action = n.action;
      if (!action) return [];
      const linkedCriteria =
        session.goalContract?.criteria
          .filter((criterion) => criterion.obligationIds.includes(n.id))
          .map((criterion) => criterion.id)
          .sort() ?? [];
      return [
        {
          nodeId: n.id,
          action,
          priority: n.severity,
          cost: ["command", "runtime-probe"].includes(action.kind)
            ? ("medium" as const)
            : ("low" as const),
          settles: settles(n.id),
          ...(linkedCriteria.length
            ? { falsifies: linkedCriteria, coversCriteria: linkedCriteria }
            : {}),
        },
      ];
    });
  // Synthesize suggestions from host-approved capabilities, not repository shell scripts.
  // Adoption versions the obligation; a suggestion alone cannot settle it.
  for (const node of session.nodes.filter(
    (n) => !n.action && n.dependsOn.length === 0 && states.get(n.id)?.status !== "supported",
  )) {
    const capabilities = (session.current.verificationCatalog ?? []).filter(
      (c) => c.level >= node.minimumLevel,
    );
    for (const capability of capabilities
      .slice()
      .sort((a, b) => a.level - b.level || a.key.localeCompare(b.key))
      .slice(0, 3))
      nextActions.push({
        nodeId: node.id,
        action: { kind: capability.kind, paths: ["."], target: capability.key },
        priority: node.severity,
        cost: capability.cost,
        settles: settles(node.id),
        requiresAdoption: true,
        ...(session.goalContract?.criteria.some((criterion) =>
          criterion.obligationIds.includes(node.id),
        )
          ? {
              falsifies: session.goalContract.criteria
                .filter((criterion) => criterion.obligationIds.includes(node.id))
                .map((criterion) => criterion.id),
              coversCriteria: session.goalContract.criteria
                .filter((criterion) => criterion.obligationIds.includes(node.id))
                .map((criterion) => criterion.id),
            }
          : {}),
        reason:
          "Host-approved capability meets the requested level; review its behavioral coverage before adopting.",
      });
  }
  nextActions.sort(
    (a, b) =>
      rank[a.priority] - rank[b.priority] ||
      Number(a.action.kind !== "text-absent") - Number(b.action.kind !== "text-absent") ||
      b.settles.length / (b.cost === "medium" ? 3 : 1) -
        a.settles.length / (a.cost === "medium" ? 3 : 1) ||
      a.nodeId.localeCompare(b.nodeId) ||
      a.action.target.localeCompare(b.action.target),
  );
  const requirements = session.nodes.filter(
    (n) => n.kind === "Requirement" || n.kind === "Invariant",
  );
  const ceiling = (
    requirements.length ? Math.min(...requirements.map((n) => states.get(n.id)?.level ?? 0)) : 0
  ) as ProofLevel;
  const report: ProofReport = {
    session,
    nodes: [...states.values()],
    debt,
    changedArtifacts: changed,
    semanticChanges,
    unjustifiedMutations: unjustified,
    blindspots,
    nextActions,
    guaranteeCeiling: ceiling,
    contractChanges,
  };
  return { ...report, goal: evaluateGoalSatisfaction(session, report) };
}
