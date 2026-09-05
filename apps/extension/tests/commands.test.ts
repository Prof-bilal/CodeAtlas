import { afterEach, describe, expect, it } from "vitest";
import { ContextClient } from "../src/client";
import { type AtlasRunner, type CommandContext, registerCommands } from "../src/commands";
import { StatusBarController } from "../src/status-bar";
import type { VscodeApi } from "../src/vscode-host";
import { type FakeHostRecords, createFakeHost, fakeStatusBarItem } from "./fake-host";
import { type Fixture, createEmptyFixture, createFixture } from "./fixture";

const ALL_COMMANDS = [
  "codeatlas.openOverview",
  "codeatlas.searchSymbols",
  "codeatlas.searchFiles",
  "codeatlas.showModules",
  "codeatlas.showSummaries",
  "codeatlas.showDependencies",
  "codeatlas.runBuild",
  "codeatlas.runUpdate",
  "codeatlas.refresh",
  "codeatlas.openFile",
];

interface Harness {
  client: ContextClient;
  host: VscodeApi;
  records: FakeHostRecords;
  actions: string[];
  refreshCount(): number;
}

const fixtures: Fixture[] = [];
const harnesses: Harness[] = [];
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.length = 0;
  for (const harness of harnesses) {
    harness.client.close();
  }
  harnesses.length = 0;
});

function makeHarness(root: string): Harness {
  const client = new ContextClient({ repositoryPath: root });
  const { host, records } = createFakeHost();
  let refreshes = 0;
  const actions: string[] = [];
  const runner: AtlasRunner = {
    run: async (action) => {
      actions.push(action);
      return { ok: true, summary: `done ${action}` };
    },
  };
  const ctx: CommandContext = {
    client,
    host,
    runner,
    refreshAll: () => {
      refreshes += 1;
    },
  };
  registerCommands(ctx);
  return { client, host, records, actions, refreshCount: () => refreshes };
}

async function invoke(h: Harness, name: string, ...args: unknown[]): Promise<unknown> {
  const handler = h.records.registeredCommands.get(name);
  if (handler === undefined) {
    throw new Error(`command not registered: ${name}`);
  }
  return Promise.resolve(handler(...args));
}

describe("registerCommands", () => {
  it("registers every codeatlas command", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const h = makeHarness(fixture.root);
    harnesses.push(h);

    const registered = [...h.records.registeredCommands.keys()].sort();
    expect(registered).toEqual([...ALL_COMMANDS].sort());
  });

  it("opens a file at a line (codeatlas.openFile)", async () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const h = makeHarness(fixture.root);
    harnesses.push(h);

    await invoke(h, "codeatlas.openFile", { filePath: "/src/math.ts", line: 4 });
    expect(h.records.openedDocs).toContainEqual({ path: "/src/math.ts", line: 4 });
  });

  it("runs atlas build and refreshes on success", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const h = makeHarness(fixture.root);
    harnesses.push(h);

    const refreshBefore = h.refreshCount();
    await invoke(h, "codeatlas.runBuild");
    expect(h.actions).toContain("build");
    expect(h.refreshCount()).toBeGreaterThan(refreshBefore);
    const runningMessage = h.records.messages.some((message) =>
      message.startsWith("info: Running:"),
    );
    expect(runningMessage).toBe(true);
  });

  it("records a build error when the run fails", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    const { host, records } = createFakeHost();
    const failingRunner: AtlasRunner = {
      run: async () => ({ ok: false, summary: "compilation failed" }),
    };
    const ctx: CommandContext = {
      client,
      host,
      runner: failingRunner,
      refreshAll: () => {},
    };
    registerCommands(ctx);

    const handler = records.registeredCommands.get("codeatlas.runBuild");
    expect(handler).toBeDefined();
    await handler?.();

    expect(client.lastBuildError).toBe("compilation failed");
    const errorMessage = records.messages.some((m) => m.startsWith("error:"));
    expect(errorMessage).toBe(true);
    client.close();
  });

  it("bails out of search with a hint when no index exists", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const h = makeHarness(fixture.root);
    harnesses.push(h);

    await invoke(h, "codeatlas.searchSymbols");
    expect(h.records.quickPickItems).toHaveLength(0);
    expect(h.records.messages.some((message) => message.includes("No CodeAtlas index"))).toBe(true);
  });

  it("quick-picks a symbol and opens its file", async () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const h = makeHarness(fixture.root);
    harnesses.push(h);

    await invoke(h, "codeatlas.searchSymbols");
    expect(h.records.quickPickItems.length).toBeGreaterThan(0);
    expect(h.records.openedDocs).toContainEqual({ path: "/src/math.ts", line: 1 });
  });
});

describe("runCli status bar lifecycle", () => {
  it("shows 'indexing…' while the build is running", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    const { host, records } = createFakeHost();

    let done!: () => void;
    const promise = new Promise<void>((resolve) => {
      done = resolve;
    });
    const slowRunner: AtlasRunner = {
      run: async () => {
        await promise;
        return { ok: true, summary: "done" };
      },
    };
    const item = fakeStatusBarItem();
    const statusBar = new StatusBarController(item);
    const ctx: CommandContext = {
      client,
      host,
      runner: slowRunner,
      statusBar,
      refreshAll: () => {
        statusBar.render(client);
      },
    };
    registerCommands(ctx);

    const handler = records.registeredCommands.get("codeatlas.runBuild");
    const runPromise = handler();

    expect(item.text).toBe("CodeAtlas: indexing…");
    expect(item.shown).toBe(true);

    done();
    await runPromise;

    expect(item.text).not.toContain("indexing");
    client.close();
  });

  it("shows 'build failed' after a failing run completes", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    const { host, records } = createFakeHost();
    const failingRunner: AtlasRunner = {
      run: async () => ({ ok: false, summary: "compilation failed" }),
    };
    const item = fakeStatusBarItem();
    const statusBar = new StatusBarController(item);
    const ctx: CommandContext = {
      client,
      host,
      runner: failingRunner,
      statusBar,
      refreshAll: () => {
        statusBar.render(client);
      },
    };
    registerCommands(ctx);

    const handler = records.registeredCommands.get("codeatlas.runBuild");
    await handler();

    expect(item.text).toContain("build failed");
    expect(item.tooltip).toBe("compilation failed");
    client.close();
  });

  it("shows 'build failed' when the runner throws", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    const { host, records } = createFakeHost();
    const throwingRunner: AtlasRunner = {
      run: async () => {
        throw new Error("cli not found");
      },
    };
    const item = fakeStatusBarItem();
    const statusBar = new StatusBarController(item);
    const ctx: CommandContext = {
      client,
      host,
      runner: throwingRunner,
      statusBar,
      refreshAll: () => {
        statusBar.render(client);
      },
    };
    registerCommands(ctx);

    const handler = records.registeredCommands.get("codeatlas.runBuild");
    await handler();

    expect(client.lastBuildError).toBe("cli not found");
    expect(item.text).toContain("build failed");
    expect(item.tooltip).toBe("cli not found");
    expect(records.messages.some((m) => m.startsWith("error:"))).toBe(true);
    client.close();
  });
});

describe("refresh clears stale build error", () => {
  it("clears lastBuildError when the index is available", async () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    client.lastBuildError = "previous failure";
    const { host, records } = createFakeHost();
    let refreshes = 0;
    const ctx: CommandContext = {
      client,
      host,
      runner: { run: async () => ({ ok: true, summary: "" }) },
      refreshAll: () => {
        refreshes += 1;
      },
    };
    registerCommands(ctx);

    const handler = records.registeredCommands.get("codeatlas.refresh");
    await handler();

    expect(client.lastBuildError).toBeNull();
    expect(refreshes).toBe(1);
    client.close();
  });
});
