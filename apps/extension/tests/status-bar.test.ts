import { afterEach, describe, expect, it } from "vitest";
import { ContextClient } from "../src/client";
import { StatusBarController, statusBarModel } from "../src/status-bar";
import { createEmptyFixture, createFixture, type Fixture } from "./fixture";
import { fakeStatusBarItem, type FakeStatusBarItem } from "./fake-host";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.length = 0;
});

describe("status bar model", () => {
  it("advertises the build command when no index exists", () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const model = statusBarModel(client);
    expect(model.text).toContain("no index");
    expect(model.command).toBe("codeatlas.runBuild");
    client.close();
  });

  it("shows indexed counts and opens the overview when ready", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const model = statusBarModel(client);
    expect(model.text).toContain("3 files");
    expect(model.text).toContain("3 symbols");
    expect(model.command).toBe("codeatlas.openOverview");
    client.close();
  });
});

describe("StatusBarController", () => {
  it("mirrors the model onto the item and shows it", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const item: FakeStatusBarItem = fakeStatusBarItem();
    const controller = new StatusBarController(item);
    controller.render(client);

    expect(item.text).toContain("3 files");
    expect(item.shown).toBe(true);
    client.close();
  });
});
