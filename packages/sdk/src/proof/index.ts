import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  AdoptGoalInput,
  BehavioralDifferential,
  GoalContractDraft,
  GoalCoverageGraph,
  GoalDismissal,
  GoalPort,
  GoalSatisfactionReceipt,
  GoalSatisfactionReport,
  HttpProbeTarget,
  InspectPort,
  PortableChangeState,
  ProofHistoryEntry,
  ProofLevel,
  ProofPort,
  ProofProposal,
  ProofReport,
  ProviderPort,
  RepositoryRevision,
  TemporalProofGraph,
  UsagePort,
  VerificationAction,
  VerifyCommandConfig,
} from "@prof-bilal/atlas-core";
import { buildSnapshot } from "@prof-bilal/atlas-hashing";
import {
  behavioralDifferential,
  createProofEngine,
  evaluateGoalSatisfaction,
  projectGoalCoverage,
  projectProofGraph,
  proposeGoalDraft,
  proposeObligations,
} from "@prof-bilal/atlas-proof";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { withUsageTracking } from "@prof-bilal/atlas-usage";
import { denyFilter } from "../context-integration/deny";
import { buildWorkPacket, renderWorkPacket } from "../context-integration/work-packet";
import { createContextSDK } from "../context/sdk";
import { indexProject } from "../indexing/indexer";
import { scanProjectOverview } from "../indexing/scan";
import { createVerifier } from "../verifier";
import { type Watcher, createWatcher } from "../watch/watcher";
import { historicalCoupling } from "./history";
import { publicContracts, semanticHash } from "./semantic";

export interface ApprovedProofCommand {
  readonly config: VerifyCommandConfig;
  /** Set by the application, never inferred from a model's proposed action. */
  readonly level: 2 | 3 | 4;
  /** Explicit host-declared investigation mapping, not inferred from exit status. */
  readonly investigates?: readonly string[];
}
export interface ApprovedRuntimeProof {
  readonly target: HttpProbeTarget;
  readonly expectedStatus: number;
  readonly bodyIncludes?: string;
  /** Trusted deployment adapter must bind the running service to the exact working-tree revision. */
  readonly deployedRevision: () => Promise<string>;
  readonly ttlMs: number;
  readonly investigates?: readonly string[];
}
export interface ProofSDKOptions {
  readonly repositoryPath: string;
  /** Explicit application approval; repository configuration is never loaded implicitly. */
  readonly commands?: Readonly<Record<string, ApprovedProofCommand>>;
  /** Optional history ranking, bounded to 1..100 commits. */
  readonly historyCommits?: number;
  /** Explicit non-secret toolchain/runtime identity supplied by the host, never process.env. */
  readonly environmentIdentity?: string;
  readonly proposalProvider?: ProviderPort;
  readonly proposalModel?: string;
  /** Required for model proposals, reusing existing usage accounting and hard limits. */
  readonly proposalUsage?: UsagePort;
  readonly runtime?: {
    readonly inspector: InspectPort;
    readonly probes: Readonly<Record<string, ApprovedRuntimeProof>>;
  };
}
export interface ProofSDK extends ProofPort, GoalPort {
  /** Agent-reported misses affect investigation ranking only, after repeated observations. */
  recordAgentMiss(changeId: string, paths: readonly string[], reason: string): Promise<void>;
  history(
    changeId: string,
    afterVersion?: number,
    limit?: number,
  ): Promise<readonly ProofHistoryEntry[]>;
  watch(options?: {
    debounceMs?: number;
    onChange?: (report: ProofReport) => void;
    onError?: (error: Error) => void;
  }): Promise<Watcher>;
  propose(
    changeId: string,
    approval: { approved: boolean; maxTokens?: number },
  ): Promise<readonly ProofProposal[]>;
  proposeGoal(
    changeId: string,
    approval: { approved: boolean; maxTokens?: number },
  ): Promise<GoalContractDraft>;
  adoptGoal(changeId: string, input: AdoptGoalInput): Promise<ProofReport>;
  dismissGoal(changeId: string, decisions: readonly GoalDismissal[]): Promise<ProofReport>;
  goal(changeId: string): Promise<GoalSatisfactionReport>;
  differential(changeId: string): Promise<BehavioralDifferential>;
  graph(changeId: string): Promise<TemporalProofGraph>;
  goalGraph(changeId: string): Promise<GoalCoverageGraph>;
  prove(changeId: string): Promise<GoalSatisfactionReceipt>;
  exportState(changeId: string): Promise<PortableChangeState>;
}
const runFile = promisify(execFile);
const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const under = (path: string, scope: string): boolean =>
  scope === "." || path === scope || path.startsWith(`${scope}/`);

/** Open lazily through this factory; existing context consumers create no proof files. */
export async function createProofSDK(initialOptions: ProofSDKOptions): Promise<ProofSDK> {
  // Capture approvals before the first await. Caller-owned mutable objects must
  // not change the executable capability without changing its evidence identity.
  const options: ProofSDKOptions = {
    ...initialOptions,
    ...(initialOptions.commands ? { commands: structuredClone(initialOptions.commands) } : {}),
    ...(initialOptions.runtime
      ? {
          runtime: {
            inspector: initialOptions.runtime.inspector,
            probes: Object.fromEntries(
              Object.entries(initialOptions.runtime.probes).map(([key, probe]) => [
                key,
                {
                  ...probe,
                  target: structuredClone(probe.target),
                  ...(probe.investigates ? { investigates: [...probe.investigates] } : {}),
                },
              ]),
            ),
          },
        }
      : {}),
  };
  const root = await realpath(resolve(options.repositoryPath));
  const directory = join(root, ".codeatlas");
  await mkdir(directory, { recursive: true });
  if ((await realpath(directory)) !== directory)
    throw new Error("Redirected .codeatlas directory is not permitted for proof state.");
  const filePath = join(directory, "proof.db");
  for (const path of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error("Proof database must not be a symlink.");
  }
  const store = new ProofStore(filePath);
  const repositoryId = digest(root);
  const syntaxCache = new Map<string, string | undefined>();
  const contractCache = new Map<string, ReturnType<typeof publicContracts>>();
  const environmentId = digest([
    "proof-observer:2",
    process.version,
    process.platform,
    process.arch,
    options.environmentIdentity ?? "unspecified",
    options.commands ?? {},
    Object.entries(options.runtime?.probes ?? {}).map(([key, p]) => [
      key,
      p.target,
      p.expectedStatus,
      p.bodyIncludes,
      p.ttlMs,
      p.investigates,
    ]),
  ]);
  const watchers = new Set<Watcher>();
  let closed = false;
  let active = false;
  let leaseOwner: string | undefined;
  const executeLocked = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) throw new Error("Proof SDK is closed.");
    const owner = randomBytes(16).toString("hex");
    if (active || !store.acquireLease("repository", owner))
      throw new Error("Repository proof execution is leased; retry later.");
    active = true;
    leaseOwner = owner;
    let lost = false;
    const heartbeat = setInterval(() => {
      try {
        if (!store.renewLease("repository", owner)) lost = true;
      } catch {
        lost = true;
      }
    }, 10000);
    heartbeat.unref();
    try {
      const result = await operation();
      if (lost || !store.renewLease("repository", owner))
        throw new Error("Proof execution lease expired; recheck required.");
      return result;
    } finally {
      clearInterval(heartbeat);
      active = false;
      leaseOwner = undefined;
      store.releaseLease("repository", owner);
    }
  };
  let operationTail = Promise.resolve();
  const locked = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationTail.then(() => executeLocked(operation));
    operationTail = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  let historyCache:
    | { head: string | null; signals: Awaited<ReturnType<typeof historicalCoupling>> }
    | undefined;
  const safePath = (path: string): string => {
    if (process.platform !== "win32" && path.includes("\\"))
      throw new Error("Ambiguous proof artifact path.");
    const rel = relative(root, resolve(root, path)).replace(/\\/g, "/");
    if (!rel || rel.startsWith("../") || rel === ".." || !denyFilter(rel, "").accepted)
      throw new Error("Unsafe proof artifact path.");
    return rel;
  };
  const head = async (): Promise<string | null> => {
    try {
      return (
        await runFile("git", ["rev-parse", "--verify", "HEAD"], {
          cwd: root,
          timeout: 3000,
          maxBuffer: 4096,
        })
      ).stdout.trim();
    } catch {
      return null;
    }
  };
  const snapshot = async () => {
    if (syntaxCache.size > 20000) {
      syntaxCache.clear();
      contractCache.clear();
    }
    const scan = await scanProjectOverview(root as FilePath);
    if (!scan.ok) throw scan.error;
    const paths: string[] = [];
    let complete = scan.value.files.length <= 10000;
    for (const file of scan.value.files.slice(0, 10000)) {
      if (!denyFilter(file.path, "").accepted) continue;
      const info = await lstat(file.path);
      if (info.isSymbolicLink() || !info.isFile() || file.sizeBytes > 2 * 1024 * 1024) {
        complete = false;
        continue;
      }
      paths.push(file.path);
    }
    const hashes = await buildSnapshot(paths, { strict: true });
    if (!hashes.ok) throw hashes.error;
    const artifacts = [];
    for (const [path, hash] of Object.entries(hashes.value.hashes)) {
      const rel = safePath(path);
      let semantic = syntaxCache.get(`${rel}:${hash}`);
      if (!syntaxCache.has(`${rel}:${hash}`)) {
        if (/\.[cm]?[jt]sx?$/i.test(path)) {
          const content = await readFile(path, "utf8");
          if (denyFilter(rel, content).accepted) {
            semantic = semanticHash(rel, content);
            contractCache.set(`${rel}:${hash}`, publicContracts(rel, content));
          }
        }
        syntaxCache.set(`${rel}:${hash}`, semantic);
      }
      const contracts = contractCache.get(`${rel}:${hash}`);
      artifacts.push({
        path: rel,
        hash,
        id: digest([repositoryId, rel]),
        ...(semantic ? { semanticHash: semantic } : {}),
        ...(contracts ? { contracts } : {}),
      });
    }
    artifacts.sort((a, b) => a.path.localeCompare(b.path));
    return { artifacts, complete };
  };
  const observe = async (): Promise<RepositoryRevision> => {
    const before = await snapshot();
    const firstHead = await head();
    const indexed = await indexProject({ repositoryPath: root, mode: "update" });
    const context = createContextSDK({ repositoryPath: root });
    let dependencies: RepositoryRevision["dependencies"] = [];
    let complete = before.complete;
    const limitations = [
      "Scanner-visible, deny-filtered files only; ignored files and external runtime state are outside the proof boundary.",
      "File-level invalidation; declaration identity survives line changes, not arbitrary renames/moves. Syntax contracts are conservative, not runtime equivalence.",
    ];
    try {
      if (!indexed.ok) {
        complete = false;
        limitations.push("Repository graph refresh failed.");
      } else {
        const paths = new Map(
          context.symbols
            .listSymbols()
            .map((symbol) => [`n:${symbol.id}`, safePath(symbol.filePath)]),
        );
        const nodePath = (id: string): string | undefined =>
          id.startsWith("n:file:") ? safePath(id.slice(7)) : paths.get(id);
        const edges = new Map<string, { from: string; to: string; kind: string }>();
        for (const edge of context.dependencies.getDependencyGraph()) {
          let from: string | undefined;
          let to: string | undefined;
          try {
            from = nodePath(edge.from);
            to = nodePath(edge.to);
          } catch {
            continue;
          }
          if (from && to && from !== to) {
            const value = { from, to, kind: edge.kind };
            edges.set(JSON.stringify(value), value);
          }
        }
        dependencies = [...edges].sort(([a], [b]) => a.localeCompare(b)).map(([, edge]) => edge);
        if (indexed.value.unresolvedImports || indexed.value.referencesSkipped)
          limitations.push(
            "Some repository dependencies are unresolved or references were skipped; proof cannot establish absence of semantic coupling.",
          );
      }
    } finally {
      context.close();
    }
    const after = await snapshot();
    const currentHead = await head();
    complete =
      complete &&
      after.complete &&
      digest(before.artifacts) === digest(after.artifacts) &&
      firstHead === currentHead;
    const coupling: NonNullable<RepositoryRevision["coupling"]>[number][] = dependencies.map(
      (e) => ({
        from: e.from,
        to: e.to,
        kind: e.kind === "tested-by" ? "shared-test" : "static",
        value: 1,
        samples: 1,
      }),
    );
    const knownPaths = new Set(after.artifacts.map((a) => a.path));
    coupling.push(
      ...store.couplingMemory().filter((s) => knownPaths.has(s.from) && knownPaths.has(s.to)),
    );
    if (options.historyCommits && currentHead) {
      try {
        if (!historyCache || historyCache.head !== currentHead)
          historyCache = {
            head: currentHead,
            signals: await historicalCoupling(root, options.historyCommits),
          };
        const paths = new Set(after.artifacts.map((a) => a.path));
        coupling.push(...historyCache.signals.filter((s) => paths.has(s.from) && paths.has(s.to)));
      } catch {
        limitations.push("Historical coupling is unavailable.");
      }
    }
    return {
      id: digest([
        repositoryId,
        currentHead,
        after.artifacts,
        dependencies,
        complete,
        environmentId,
      ]),
      environmentId,
      verificationCatalog: [
        ...Object.entries(options.commands ?? {}).map(([key, c]) => ({
          key,
          level: c.level,
          kind: "command" as const,
          cost: "medium" as const,
        })),
        ...Object.keys(options.runtime?.probes ?? {}).map((key) => ({
          key,
          level: 5 as const,
          kind: "runtime-probe" as const,
          cost: "medium" as const,
        })),
      ],
      repositoryId,
      head: currentHead,
      observedAt: new Date().toISOString(),
      complete,
      artifacts: after.artifacts,
      dependencies,
      limitations,
      coupling,
    };
  };
  const verifier = createVerifier({
    resolveSymbols: async () => [],
    getAnswerText: () => "",
    computeFingerprint: async () => "unused",
  });
  const engine = createProofEngine(
    {
      get: (id) => store.get(id),
      put: (session, version) => {
        if (!leaseOwner || !store.renewLease("repository", leaseOwner))
          throw new Error("Proof execution lease expired before commit.");
        store.put(session, version);
      },
      close: () => store.close(),
    },
    {
      observe,
      async execute(action: VerificationAction, revision, baseline) {
        if (action.kind === "public-contract-unchanged") {
          if (!baseline)
            return { result: "unknown", level: 0, detail: "No observed baseline contract." };
          const paths = [
            ...new Set(
              [...baseline.artifacts, ...revision.artifacts]
                .filter((a) => action.paths.some((p) => under(a.path, p)))
                .map((a) => a.path),
            ),
          ];
          if (!paths.length)
            return { result: "unknown", level: 0, detail: "No observable public contract scope." };
          const closure = new Set(paths);
          const dependencies = new Map<string, Set<string>>();
          for (const edge of [...baseline.dependencies, ...revision.dependencies]) {
            if (edge.kind === "tested-by") continue;
            const targets = dependencies.get(edge.from) ?? new Set<string>();
            targets.add(edge.to);
            dependencies.set(edge.from, targets);
          }
          for (let i = 0; i < paths.length; i++)
            for (const target of dependencies.get(paths[i]) ?? [])
              if (!closure.has(target)) {
                closure.add(target);
                paths.push(target);
              }
          const old = new Map(baseline.artifacts.map((a) => [a.path, a]));
          const current = new Map(revision.artifacts.map((a) => [a.path, a]));
          for (const path of paths) {
            const before = old.get(path);
            const after = current.get(path);
            if ((before && !before.contracts) || (after && !after.contracts))
              return {
                result: "unknown",
                level: 0,
                detail: "Unsupported or malformed contract syntax prevents proof.",
              };
            if (JSON.stringify(before?.contracts ?? []) !== JSON.stringify(after?.contracts ?? []))
              return {
                result: "fail",
                level: 1,
                detail: `Public syntax contract changed: ${path}.`,
                investigatedPaths: [path],
              };
          }
          return {
            result: "pass",
            level: 1,
            detail: "Observed exported syntax contracts unchanged; no runtime behavior guarantee.",
            investigatedPaths: paths,
          };
        }
        if (action.kind === "runtime-probe") {
          const probe = options.runtime?.probes[action.target];
          if (
            !probe ||
            !options.runtime ||
            !Number.isSafeInteger(probe.ttlMs) ||
            probe.ttlMs < 1 ||
            probe.ttlMs > 300000 ||
            !options.environmentIdentity ||
            (await probe.deployedRevision()) !== revision.id
          )
            return {
              result: "unknown",
              level: 0,
              detail: "Runtime probe is unapproved, unbound or deployment revision differs.",
            };
          const result = await options.runtime.inspector.probeHttp(probe.target);
          const unchanged = (await probe.deployedRevision()) === revision.id;
          const passed =
            result.ok &&
            result.value.error === null &&
            result.value.statusCode === probe.expectedStatus &&
            (probe.bodyIncludes === undefined ||
              result.value.body?.includes(probe.bodyIncludes) === true);
          return {
            result:
              !unchanged || !result.ok || result.value.error ? "unknown" : passed ? "pass" : "fail",
            level: 5,
            detail:
              "Approved deployment-bound runtime predicate; response content and credentials are not persisted.",
            expiresAt: new Date(Date.now() + probe.ttlMs).toISOString(),
            investigatedPaths: revision.artifacts
              .filter((a) => (probe.investigates ?? []).some((p) => under(a.path, p)))
              .map((a) => a.path),
          };
        }
        if (action.kind === "command") {
          const approved = options.commands?.[action.target];
          if (!approved || ![2, 3, 4].includes(approved.level))
            return {
              result: "unknown",
              level: 0,
              detail: "Command is not explicitly approved by the application.",
            };
          const results = await verifier.runCommands(
            { enabled: true, commands: { [action.target]: approved.config } },
            root,
          );
          const passed =
            results.length === 1 && results.every((r) => r.exitCode === 0 && !r.timedOut);
          // Persist metadata only; stdout/stderr can contain credentials.
          return {
            result: passed ? "pass" : "fail",
            level: approved.level,
            detail: `Approved ${action.target}: ${passed ? "passed" : "failed"}. Command output is not persisted.`,
            investigatedPaths: revision.artifacts
              .filter((a) => (approved.investigates ?? []).some((p) => under(a.path, p)))
              .map((a) => a.path),
          };
        }
        const targets = revision.artifacts.filter((a) =>
          action.paths.some((p) => under(a.path, p)),
        );
        if (action.kind === "artifact-exists")
          return {
            result: targets.some((a) => a.path === action.target) ? "pass" : "fail",
            level: 1,
            detail: "Deterministic artifact existence check; no behavioral guarantee.",
          };
        if (action.kind === "symbol-exists") {
          const tsFamily = targets.some((artifact) => /\.[cm]?[jt]sx?$/i.test(artifact.path));
          if (!tsFamily)
            return {
              result: "unknown",
              level: 0,
              detail: "Symbol predicates are limited to observed TS-family artifacts.",
            };
          const context = createContextSDK({ repositoryPath: root });
          try {
            const matches = context.symbols.listSymbols().filter((symbol) => {
              if (symbol.name !== action.target) return false;
              const file = symbol.filePath.replaceAll("\\", "/");
              return targets.some(
                (artifact) =>
                  file === artifact.path ||
                  file.endsWith(`/${artifact.path}`) ||
                  artifact.path.endsWith(`/${file}`),
              );
            });
            return {
              result: matches.length ? "pass" : "fail",
              level: 1,
              detail: matches.length
                ? "Symbol declaration found in the indexed TS-family graph; references may still be dynamic."
                : "No matching symbol declaration in the indexed TS-family graph; dynamic construction remains unknown.",
              investigatedPaths: targets.map((artifact) => artifact.path),
            };
          } catch {
            return {
              result: "unknown",
              level: 0,
              detail: "The indexed symbol graph is unavailable for this predicate.",
            };
          } finally {
            context.close();
          }
        }
        if (targets.length === 0)
          return { result: "unknown", level: 0, detail: "No observable files in search scope." };
        if (!["text-absent", "text-present"].includes(action.kind))
          return { result: "unknown", level: 0, detail: "Unsupported read-only predicate." };
        const investigated: string[] = [];
        for (const artifact of targets) {
          const absolute = join(root, artifact.path);
          if ((await realpath(absolute)) !== absolute)
            return {
              result: "unknown",
              level: 0,
              detail: "Redirected file cannot establish a literal predicate.",
            };
          const info = await lstat(absolute);
          if (!info.isFile() || info.size > 2 * 1024 * 1024)
            return { result: "unknown", level: 0, detail: "Unobservable search input." };
          const content = await readFile(absolute, "utf8");
          if (content.includes("\0") || !denyFilter(artifact.path, content).accepted)
            return {
              result: "unknown",
              level: 0,
              detail: "Binary or denied content prevents a complete search.",
            };
          investigated.push(artifact.path);
          if (action.kind === "text-present" && content.includes(action.target))
            return {
              result: "pass",
              level: 1,
              detail: `Literal matched in ${artifact.path}; this is a structural presence check.`,
              investigatedPaths: investigated,
            };
          if (action.kind === "text-absent" && content.includes(action.target))
            return {
              result: "fail",
              level: 1,
              detail: `Falsified by literal match in ${artifact.path}.`,
              investigatedPaths: investigated,
            };
        }
        if (action.kind === "text-present")
          return {
            result: "fail",
            level: 1,
            detail:
              "Literal text was not found in observable scoped files; dynamic construction remains unknown.",
            investigatedPaths: investigated,
          };
        return {
          result: "pass",
          level: 1 as ProofLevel,
          detail:
            "Literal text absent in observable scoped files; dynamic consumers remain unknown.",
          investigatedPaths: investigated,
        };
      },
    },
  );
  // Command executions depend on the whole repository, including configuration and new files.
  const requireGlobalCommandScope = (proposals: readonly ProofProposal[]) =>
    proposals.map((p) => {
      if (!denyFilter("proposal.txt", p.statement + (p.action?.target ?? "")).accepted)
        throw new Error("Sensitive proof proposal is not permitted.");
      return p.action && ["command", "runtime-probe"].includes(p.action.kind)
        ? { ...p, action: { ...p.action, paths: ["."] } }
        : p;
    });
  const assertProposalAccess = (approval: {
    approved: boolean;
    maxTokens?: number;
  }): { provider: ProviderPort; usage: UsagePort; maxTokens: number } => {
    const provider = options.proposalProvider;
    const usage = options.proposalUsage;
    if (!approval.approved || !provider || !usage)
      throw new Error(
        "Model proposals require explicit approval, ProviderPort and usage tracking.",
      );
    const maxTokens = approval.maxTokens ?? 4000;
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 512 || maxTokens > 12000)
      throw new Error("Invalid proposal token budget.");
    for (const scope of [
      { kind: "agent" as const, value: "atlas-proof" },
      ...usage
        .listLimits()
        .filter((l) => l.scope.kind === "user")
        .map((l) => l.scope),
    ]) {
      const limit = usage.checkLimit(scope);
      if (!limit.ok || !limit.value.allowed) throw new Error("Proof proposal usage limit denied.");
    }
    return { provider, usage, maxTokens };
  };
  const api: ProofSDK = {
    ...engine,
    begin: (input) =>
      locked(() => {
        if (
          !denyFilter("goal.txt", input.goal).accepted ||
          !denyFilter("change-input.txt", JSON.stringify(input)).accepted
        )
          throw new Error("Sensitive proof goal is not permitted.");
        return engine.begin({
          ...input,
          ...(input.proposals ? { proposals: requireGlobalCommandScope(input.proposals) } : {}),
        });
      }),
    revise: (id, nodeId, statement) =>
      locked(() => {
        if (!denyFilter("proposal.txt", statement).accepted)
          throw new Error("Sensitive proof statement is not permitted.");
        return engine.revise(id, nodeId, statement);
      }),
    understand: (id, proposals) =>
      locked(() => engine.understand(id, requireGlobalCommandScope(proposals))),
    check: (id) => locked(() => engine.check(id)),
    authorize: (id, justifications) =>
      locked(() => {
        if (!denyFilter("authorization.txt", JSON.stringify(justifications)).accepted)
          throw new Error("Sensitive mutation authorization.");
        return engine.authorize(id, justifications);
      }),
    stageProposals: (id, proposals) =>
      locked(() => engine.stageProposals(id, requireGlobalCommandScope(proposals))),
    dismissProposals: (id, decisions) =>
      locked(() => {
        if (!denyFilter("proposal-decisions.txt", JSON.stringify(decisions)).accepted)
          throw new Error("Sensitive proposal decision.");
        return engine.dismissProposals(id, decisions);
      }),
    prove: (id) => locked(() => engine.prove(id)),
    exportState: (id) => locked(() => engine.exportState(id)),
    importState: (state) =>
      locked(async () => {
        if (
          !state ||
          typeof state !== "object" ||
          JSON.stringify(state).length > 8 * 1024 * 1024 ||
          !denyFilter("portable.txt", JSON.stringify(state)).accepted
        )
          throw new Error("Invalid or sensitive portable state.");
        const input = state as { nodes?: ProofProposal[] };
        return engine.importState({
          ...input,
          ...(Array.isArray(input.nodes) ? { nodes: requireGlobalCommandScope(input.nodes) } : {}),
        });
      }),
    history: (id, afterVersion, limit) =>
      locked(async () => {
        if (!/^[a-f0-9]{32}$/.test(id) || !store.get(id))
          throw new Error("Change session not found.");
        return store.history(id, afterVersion, limit);
      }),
    graph: (id) => locked(async () => projectProofGraph(await engine.exportState(id))),
    goalGraph: (id) => locked(async () => projectGoalCoverage(await engine.exportState(id))),
    goal: (id) =>
      locked(async () => {
        const report = await engine.check(id);
        return report.goal ?? evaluateGoalSatisfaction(report.session, report);
      }),
    differential: (id) =>
      locked(async () => {
        const report = await engine.check(id);
        return report.goal?.differential ?? behavioralDifferential(report.session);
      }),
    propose: (id, approval) =>
      locked(async () => {
        const { provider, usage, maxTokens } = assertProposalAccess(approval);
        const report = await engine.check(id);
        if (report.session.proposed?.length)
          throw new Error("Review existing staged proposals before requesting more.");
        const context = createContextSDK({ repositoryPath: root });
        try {
          const packet = await buildWorkPacket(context, {
            task: report.session.goal,
            changeId: id,
            maxTokens,
          });
          const tracking = withUsageTracking(provider, usage, {
            agent: "atlas-proof",
            taskId: id,
            recordOnError: true,
          });
          const proposals = await proposeObligations(
            tracking,
            renderWorkPacket(packet),
            options.proposalModel,
          );
          requireGlobalCommandScope(proposals);
          await engine.stageProposals(id, proposals);
          return proposals;
        } finally {
          context.close();
        }
      }),
    proposeGoal: (id, approval) =>
      locked(async () => {
        const { provider, usage, maxTokens } = assertProposalAccess(approval);
        const report = await engine.check(id);
        if (report.session.proposedGoal)
          throw new Error("Review the existing staged goal draft before requesting more.");
        const context = createContextSDK({ repositoryPath: root });
        try {
          const packet = await buildWorkPacket(context, {
            task: report.session.goal,
            changeId: id,
            maxTokens,
          });
          const tracking = withUsageTracking(provider, usage, {
            agent: "atlas-goal",
            taskId: id,
            recordOnError: true,
          });
          const draft = await proposeGoalDraft(
            tracking,
            renderWorkPacket(packet),
            options.proposalModel,
          );
          if (!denyFilter("goal-draft.txt", JSON.stringify(draft)).accepted)
            throw new Error("Sensitive goal draft is not permitted.");
          await engine.stageGoalDraft(id, draft);
          return draft;
        } finally {
          context.close();
        }
      }),
    stageGoalDraft: (id, draft) =>
      locked(() => {
        if (!denyFilter("goal-draft.txt", JSON.stringify(draft)).accepted)
          throw new Error("Sensitive goal draft is not permitted.");
        return engine.stageGoalDraft(id, draft);
      }),
    adoptGoalContract: (id, input) =>
      locked(() => {
        if (!denyFilter("goal-adoption.txt", JSON.stringify(input)).accepted)
          throw new Error("Sensitive goal adoption.");
        return engine.adoptGoalContract(id, input);
      }),
    adoptGoal: (id, input) =>
      locked(() => {
        if (!denyFilter("goal-adoption.txt", JSON.stringify(input)).accepted)
          throw new Error("Sensitive goal adoption.");
        return engine.adoptGoalContract(id, input);
      }),
    dismissGoalDraft: (id, decisions) =>
      locked(() => {
        if (!denyFilter("goal-dismissal.txt", JSON.stringify(decisions)).accepted)
          throw new Error("Sensitive goal dismissal.");
        return engine.dismissGoalDraft(id, decisions);
      }),
    dismissGoal: (id, decisions) =>
      locked(() => {
        if (!denyFilter("goal-dismissal.txt", JSON.stringify(decisions)).accepted)
          throw new Error("Sensitive goal dismissal.");
        return engine.dismissGoalDraft(id, decisions);
      }),
    async watch(watchOptions = {}) {
      if (closed) throw new Error("Proof SDK is closed.");
      let metadataPaths: string[] = [];
      try {
        const result = await runFile(
          "git",
          [
            "rev-parse",
            "--git-path",
            "HEAD",
            "--git-path",
            "refs",
            "--git-path",
            "packed-refs",
            "--git-path",
            "index",
          ],
          {
            cwd: root,
            timeout: 3000,
            maxBuffer: 4096,
          },
        );
        const paths = result.stdout.trim().split("\n");
        if (paths.length === 4) metadataPaths = paths.map((path) => resolve(root, path));
      } catch {
        /* Non-Git repositories still have source mutation monitoring. */
      }
      const watcher = createWatcher({
        repositoryPath: root,
        additionalPaths: metadataPaths,
        ...watchOptions,
        runIndex: () => locked(() => indexProject({ repositoryPath: root, mode: "update" })),
        onIndex: async () => {
          for (const id of store.listIds()) {
            if (closed) return;
            const report = await api.check(id);
            watchOptions.onChange?.(report);
          }
        },
      });
      watchers.add(watcher);
      try {
        await watcher.start();
      } catch (error) {
        await watcher.close();
        watchers.delete(watcher);
        throw error;
      }
      return {
        ...watcher,
        close: async () => {
          await watcher.close();
          watchers.delete(watcher);
        },
      };
    },
    verify: (id, nodeId) =>
      locked(async () => {
        const report = await engine.verify(id, nodeId);
        const latest = report.session.evidence.at(-1);
        if (latest?.result === "fail") {
          const expected = report.blindspots.map((b) => b.artifact);
          store.recordMemory(
            latest.id,
            "proof-failure",
            [...new Set([...report.changedArtifacts, ...expected])].slice(0, 40),
          );
        }
        return report;
      }),
    recordAgentMiss: (id, paths, reason) =>
      locked(async () => {
        const session = await engine.exportState(id);
        if (
          !reason.trim() ||
          reason.length > 1000 ||
          !denyFilter("observation.txt", reason).accepted ||
          paths.length > 40
        )
          throw new Error("Invalid miss observation.");
        const safe = paths.map(safePath);
        const known = new Set(session.current.artifacts.map((a) => a.path));
        if (safe.some((path) => !known.has(path)))
          throw new Error("Miss observation must reference observed artifacts.");
        store.recordMemory(digest([id, safe.slice().sort(), reason]), "agent-miss", safe);
      }),
    close() {
      if (closed) return;
      if (active || watchers.size)
        throw new Error("Close proof watches and await active operations before closing the SDK.");
      closed = true;
      engine.close();
    },
  };
  return api;
}
