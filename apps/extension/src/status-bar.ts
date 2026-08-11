import type { ContextClient } from "./client";
import type { VscodeStatusBarItem } from "./vscode-host";

/** What the status bar shows for a given client state. */
export interface StatusBarModel {
  readonly text: string;
  readonly tooltip: string;
  readonly command: string;
}

/** The status-bar rendering for an index state (pure, unit-testable). */
export function statusBarModel(client: ContextClient): StatusBarModel {
  const status = client.status();
  if (!status.available) {
    return {
      text: "CodeAtlas: no index",
      tooltip: "Run CodeAtlas: Build a project index to get started.",
      command: "codeatlas.runBuild",
    };
  }
  const files = status.filesIndexed;
  const symbols = status.symbolsIndexed;
  const updated = status.lastUpdated === "" ? "never" : status.lastUpdated;
  return {
    text: `CodeAtlas: ${files} files · ${symbols} symbols`,
    tooltip: `${status.repositoryPath}\nLast updated: ${updated}`,
    command: "codeatlas.openOverview",
  };
}

/** Owns a single status-bar item and keeps it in sync with the index. */
export class StatusBarController {
  public constructor(private readonly item: VscodeStatusBarItem) {}

  public render(client: ContextClient): void {
    const model = statusBarModel(client);
    this.item.text = model.text;
    this.item.tooltip = model.tooltip;
    this.item.command = model.command;
    this.item.show();
  }
}
