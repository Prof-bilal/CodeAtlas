import { afterEach, describe, expect, it } from "vitest";
import { ContextClient } from "../src/client";
import { registerCommands, type AtlasRunner, type CommandContext } from "../src/commands";
import type { VscodeApi } from "../src/vscode-host";
import { createEmptyFixture, createFixture, type Fixture } from "./fixture";
import { createFakeHost, type FakeHostRecords } from "./fake-host";

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
  const ctx: CommandContext = { client, host, runner, refreshAll: () => (refreshes += 1) };
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
