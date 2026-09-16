# ADR-023: Remove browser control and the benchmark harness from the core repository

Status:     Accepted (amended 2026-09-16: the four web-facing Skills were
            re-pointed to the agent's own web access instead of the removed layer)
Date:       2026-09-16
Supersedes: ADR-012 (benchmark framework), ADR-013 (benchmark API server)

Context:
  The repository had accumulated two subsystems that were not part of the
  product focus (context + capabilities + Tools + Skills + SDK + CLI + MCP):

  - **Browser control.** A Playwright-CLI-backed observation layer: `BrowsePort`
    in `core`, `createBrowseService()` in the SDK, `atlas browse
    snapshot|screenshot|responsive|console|interact`, an evidence pipeline
    under `.codeatlas/evidence/`, and four prebuilt Skills built on it
    (`ui-research`, `ui-check`, `ui-build`, `webapp-testing`).
  - **Benchmark harness.** `@prof-bilal/atlas-benchmark` (`BenchmarkPort`,
    `BenchmarkStore`, OpenCode/Ollama runners, evaluator, reporters, ablation),
    the `atlas benchmark` CLI surface, `apps/server` (the benchmark HTTP API,
    ADR-013), the `benchmarks/` corpus, a dedicated vitest config, and CI
    retrieval gates.

  Both carried real costs: a large experimental surface in every consumer's
  mental model, an extra port in `core`, duplicate Skills machinery inside the
  benchmark package, a whole extra app to keep building, and a repository a new
  contributor could not map quickly. Neither was on the near-term roadmap.

Decision:
  Remove both subsystems from this repository and keep the repository focused on
  Context, Capabilities, Tools, Skills, SDK, CLI and MCP.

  1. Delete the browser layer: `BrowsePort` (+ core/index export),
     `packages/sdk/src/browse.ts` (+ tests and SDK exports),
     `apps/cli/src/commands/browse.ts` and its registration, the browser
     evidence check in `atlas evaluate`, and the `playwright-cli` /
     `playwright-mcp` catalog records. `packages/core/src/index.ts` no longer
     exports `isContextMode`.
  2. Keep all 13 prebuilt Skills, but strip every reference to the removed
     command: `allowed-tools` no longer names `atlas browse`, and no Skill body
     mentions the removed layer. The four web-facing Skills (`ui-research`,
     `ui-check`, `ui-build`, `webapp-testing`) were then **re-pointed** from the
     removed browser control to the **agent's own web fetch/search tools** plus
     the project's **own** test tooling: they may read fetched markup, styles
     and scripts as source evidence, and must report rendering-dependent checks
     (paint, viewport layout, console output) as *could not run* rather than
     inferring them. See the "Amendment" section below.
  3. Delete the benchmark package, `apps/server`, the `atlas benchmark` CLI
     surface, the SDK benchmark module and exports, `BenchmarkPort`, the
     `benchmarks/` corpus, `vitest.benchmark.config.mts`, the retrieval-gates
     CI workflow, and the benchmark docs. ADR-012 and ADR-013 are therefore
     superseded (their files were removed with the subsystem; their decisions
     are recorded here).
  4. Separate installation from capability installation: installing the CLI
     installs CodeAtlas only. `planSetup()` (SDK) returns a read-only plan of
     installable candidates; the CLI prompts for a selection, requires explicit
     confirmation, and installs **only** the selection. `runSetup()` no longer
     defaults its selection to the recommendation list, so `atlas setup --yes`
     can never install anything the user did not pick.

Alternatives:
  - Keep both subsystems but mark them experimental. Rejected: they still cost
    a port in `core`, an app in `apps/`, CI jobs, and every reader's attention,
    and "not focusing on it" is not a stable state.
  - Keep the benchmark package as a separate repository/workstream now.
    Rejected as out of scope for this change: the harness is being rebuilt
    later as its own effort, not migrated here.
  - Keep the `atlas browse` CLI commands as stubs that error. Rejected:
    a dead command surface is worse for users than no command.
  - Leave the four web-facing Skills as `[PLANNED]` placeholders that cannot run.
    Rejected: agents already have web fetch/search, so the workflows are useful
    today once re-pointed — a placeholder would hide working capability.
  - Auto-install recommendations during `atlas setup` (previous behaviour).
    Rejected by product decision: the user stays in control.

Consequences:
  - The repository is roughly 3 GB smaller on disk, has two fewer packages/apps,
    and a package graph whose only arrows are the documented ones
    (`cli → sdk → feature packages → core → shared`).
  - Skills became a first-class surface: `atlas skills` (alias `atlas skill`)
    lists built-in + installed Skills by default, and the packaged CLI ships
    `dist/skills/prebuilt`.
  - `atlas setup` is interactive and never installs unselected items;
    `--tools <ids> --yes` is the non-interactive path.
  - Removed capability, tracked honestly: browser-*rendered* UI verification and
    context-quality benchmarking are not available in this version. Rebuilding
    either requires a new ADR. Web research and source-level UI review are still
    available through the agent's own web tools.
  - Follow-ups already reflected in the docs: `docs/CURRENT_STATE.md`,
    `docs/FEATURE_STATUS.md`, `docs/reference/CLI.md`, `docs/architecture/*`,
    and `docs/REPOSITORY_MAP.md` describe the post-removal state; superseded
    planning material moved to `docs/archive/`.
