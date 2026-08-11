import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createProjectContainer } from "@atlas/sdk";
import { ContextClient } from "../src/client";
import type { AtlasRunner } from "../src/commands";
import { activateExtension } from "../src/extension-core";
import { TREE_VIEWS } from "../src/providers";
import { createEmptyFixture, createFixture, standardData, type Fixture } from "./fixture";
import { createFakeHost } from "./fake-host";

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

const fixtures: Fixture[] = [];
const clients: ContextClient[] = [];
afterEach(() => {
  for (const client of clients) {
    client.close();
  }
  clients.length = 0;
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.length = 0;
});

describe("CodeAtlasExtension", () => {
  it("registers every tree view and command on activate", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    clients.push(client);
    const { host, records } = createFakeHost();
    const runner: AtlasRunner = { run: async () => ({ ok: true, summary: "ok" }) };

    const extension = activateExtension({ client, host, runner });

    expect([...records.registeredViews].sort()).toEqual([...TREE_VIEWS].sort());
    expect([...records.registeredCommands.keys()].sort()).toEqual([...ALL_COMMANDS].sort());
    extension.dispose();
  });

  it("reflects index availability in the status bar", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    clients.push(client);
    const { host, records } = createFakeHost();
    const runner: AtlasRunner = { run: async () => ({ ok: true, summary: "" }) };

    const extension = activateExtension({ client, host, runner });
    const statusItem = records.statusBarItems[0];
    expect(statusItem).toBeDefined();
    expect(statusItem.text).toContain("3 files");
    expect(statusItem.command).toBe("codeatlas.openOverview");
    extension.dispose();
  });

  it("becomes ready after a build creates the index", async () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    clients.push(client);
    const { host, records } = createFakeHost();

    // Simulate `atlas build` writing the index on disk.
    const runner: AtlasRunner = {
      run: async () => {
        mkdirSync(join(fixture.root, ".codeatlas"), { recursive: true });
        const container = createProjectContainer(fixture.dbPath);
        try {
          container.getContextDb().saveContext(standardData());
        } finally {
          container.getContextDb().close();
        }
        return { ok: true, summary: "indexed" };
      },
    };

    const extension = activateExtension({ client, host, runner });
    expect(client.isAvailable).toBe(false);

    const handler = records.registeredCommands.get("codeatlas.runBuild");
    expect(handler).toBeDefined();
    await handler?.();

    expect(client.status().available).toBe(true);
    expect(records.statusBarItems[0].text).toContain("3 files");
    extension.dispose();
  });
});
