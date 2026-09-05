import type { CodeAtlasTarget, ContextClient } from "./client";
import { isUnavailable } from "./client";
import type { StatusBarController } from "./status-bar";
import type { VscodeApi, VscodeDisposable, VscodeQuickPickItem } from "./vscode-host";

/** The CLI actions the extension can drive (`atlas build`, `atlas update`). */
export type AtlasCliAction = "build" | "update";

/** Runs an `atlas` CLI action from the extension (shell-out). */
export interface AtlasRunner {
  run(action: AtlasCliAction): Promise<{ readonly ok: boolean; readonly summary: string }>;
}

/** Everything the command handlers need from the rest of the extension. */
export interface CommandContext {
  readonly client: ContextClient;
  readonly host: VscodeApi;
  readonly runner: AtlasRunner;
  /** Direct access to the status bar for intermediate state (e.g. "indexing…"). */
  readonly statusBar?: StatusBarController;
  /** Re-read the on-disk index and refresh every tree + the status bar. */
  readonly refreshAll: () => void;
}

/** Register every `codeatlas.*` command against the host. */
export function registerCommands(ctx: CommandContext): VscodeDisposable[] {
  const { host } = ctx;
  const handlers: Record<string, (...args: unknown[]) => Promise<void> | void> = {
    "codeatlas.openOverview": () => openOverview(ctx),
    "codeatlas.searchSymbols": () => searchSymbols(ctx),
    "codeatlas.searchFiles": () => searchFiles(ctx),
    "codeatlas.showModules": () => showModules(ctx),
    "codeatlas.showSummaries": () => showSummaries(ctx),
    "codeatlas.showDependencies": () => showDependencies(ctx),
    "codeatlas.runBuild": () => runCli(ctx, "build"),
    "codeatlas.runUpdate": () => runCli(ctx, "update"),
    "codeatlas.refresh": () => refresh(ctx),
    "codeatlas.openFile": (...args) => {
      const target = args[0] as CodeAtlasTarget | undefined;
      if (target === undefined) {
        return;
      }
      return openFile(ctx, target);
    },
  };
  const disposables: VscodeDisposable[] = [];
  for (const [command, handler] of Object.entries(handlers)) {
    disposables.push(host.views.registerCommand(command, handler));
  }
  return disposables;
}

/** `CodeAtlas: Open Project Overview` — summarize the current index. */
export async function openOverview(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!client.isAvailable) {
    await host.window.showWarningMessage(
      "No CodeAtlas index yet. Run CodeAtlas: Build to create one.",
    );
    return;
  }
  const overview = client.overview();
  const message = [
    `${overview.counts.files} files · ${overview.counts.symbols} symbols`,
    `${overview.counts.modules} modules · ${overview.counts.dependencies} dependencies · ${overview.counts.summaries} summaries`,
  ].join(" · ");
  await host.window.showInformationMessage(message);
}

/** When the index is missing, tell the user how to fix it and bail. */
async function guardAvailable(ctx: CommandContext): Promise<boolean> {
  if (ctx.client.isAvailable) {
    return true;
  }
  await ctx.host.window.showErrorMessage(
    "No CodeAtlas index in this workspace. Run CodeAtlas: Build to create one.",
  );
  return false;
}

/** `CodeAtlas: Search Symbols` — quick-pick a symbol and open it. */
export async function searchSymbols(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!(await guardAvailable(ctx))) {
    return;
  }
  const symbols = client.listSymbols();
  if (symbols.length === 0) {
    await host.window.showInformationMessage("No symbols in the CodeAtlas index.");
    return;
  }
  const items: VscodeQuickPickItem[] = symbols.map((s) => ({
    label: s.name,
    description: `${s.kind} · ${symbolRowPath(s.filePath, s.line)}`,
    ...(s.documentation !== null ? { detail: s.documentation } : {}),
  }));
  const picked = await host.window.showQuickPick(items, { placeHolder: "Search symbols" });
  if (picked === undefined) {
    return;
  }
  const expected = `${picked.description}`;
  const symbol = symbols.find(
    (s) => `${s.kind} · ${symbolRowPath(s.filePath, s.line)}` === expected,
  );
  if (symbol !== undefined) {
    await openFile(ctx, symbol);
  }
}

/** `CodeAtlas: Search Files` — quick-pick an indexed file and open it. */
export async function searchFiles(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!(await guardAvailable(ctx))) {
    return;
  }
  const files = client.listFiles();
  if (files.length === 0) {
    await host.window.showInformationMessage("No files in the CodeAtlas index.");
    return;
  }
  const items: VscodeQuickPickItem[] = files.map((file) => ({
    label: file.path,
    detail: file.language,
  }));
  const picked = await host.window.showQuickPick(items, { placeHolder: "Search files" });
  if (picked !== undefined) {
    await openFile(ctx, { filePath: picked.label, line: 1 });
  }
}

/** `CodeAtlas: Show Modules` — list the indexed modules. */
export async function showModules(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!(await guardAvailable(ctx))) {
    return;
  }
  const modules = client.modules();
  if (modules.length === 0) {
    await host.window.showInformationMessage("No modules in the CodeAtlas index.");
    return;
  }
  const items: VscodeQuickPickItem[] = modules.map((m) => ({ label: m.name, description: m.path }));
  const picked = await host.window.showQuickPick(items, { placeHolder: "Choose a module" });
  if (picked !== undefined) {
    await host.window.showInformationMessage(`CodeAtlas module: ${picked.label}`);
  }
}

/** `CodeAtlas: Show Summaries` — overviews of the stored summaries. */
export async function showSummaries(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!(await guardAvailable(ctx))) {
    return;
  }
  const summaries = client.summaries();
  if (summaries.length === 0) {
    await host.window.showInformationMessage("No summaries in the CodeAtlas index.");
    return;
  }
  const preview = summaries
    .slice(0, 3)
    .map((s) => {
      const target = s.target === "" ? "Project" : s.target;
      return `${target}: ${s.content.overview.slice(0, 60)}`;
    })
    .join("\n");
  await host.window.showInformationMessage(`${summaries.length} summary(ies)\n${preview}`);
}

/** `CodeAtlas: Show Dependency Graph` — the edge count plus a sample. */
export async function showDependencies(ctx: CommandContext): Promise<void> {
  const { client, host } = ctx;
  if (!(await guardAvailable(ctx))) {
    return;
  }
  const dependencies = client.dependencies();
  if (dependencies.length === 0) {
    await host.window.showInformationMessage("No dependencies in the CodeAtlas index.");
    return;
  }
  const count = dependencies.length;
  const sample = dependencies
    .slice(0, 5)
    .map((d) => `${d.fromLabel} → ${d.toLabel} (${d.kind})`)
    .join("\n");
  await host.window.showInformationMessage(`${count} edge${count === 1 ? "" : "s"}\n${sample}`);
}

/** `CodeAtlas: Run atlas build` / `Run atlas update`. */
export async function runCli(ctx: CommandContext, action: AtlasCliAction): Promise<void> {
  const { client, host, runner, statusBar, refreshAll } = ctx;
  statusBar?.indexing();
  await host.window.showInformationMessage(`Running: atlas ${action} …`);
  try {
    const result = await runner.run(action);
    if (!result.ok) {
      client.lastBuildError = result.summary;
      refreshAll();
      await host.window.showErrorMessage(`atlas ${action} failed — ${result.summary}`);
      return;
    }
    client.lastBuildError = null;
    refreshAll();
    await host.window.showInformationMessage(
      result.summary === "" ? `atlas ${action} succeeded` : result.summary,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    client.lastBuildError = message;
    refreshAll();
    await host.window.showErrorMessage(`atlas ${action} failed — ${message}`);
  } finally {
    refreshAll();
  }
}

/** `CodeAtlas: Refresh` — re-read the index and redraw the trees. */
export async function refresh(ctx: CommandContext): Promise<void> {
  const { client, host, refreshAll } = ctx;
  refreshAll();
  if (!client.isAvailable) {
    await host.window.showInformationMessage(
      "CodeAtlas refreshed. Still no index — run CodeAtlas: Build.",
    );
    return;
  }
  client.lastBuildError = null;
  const status = client.status();
  await host.window.showInformationMessage(
    `CodeAtlas refreshed: ${status.filesIndexed} files, ${status.symbolsIndexed} symbols.`,
  );
}

/** Open a symbol/file at its line in the editor. */
export async function openFile(ctx: CommandContext, target: CodeAtlasTarget): Promise<void> {
  try {
    await ctx.host.window.showTextDocument(target.filePath, target.line);
  } catch (error) {
    if (isUnavailable(error)) {
      await ctx.host.window.showErrorMessage(`No CodeAtlas index: ${target.filePath}`);
    } else {
      throw error;
    }
  }
}

/** Render `path:line` with only the source file name, like the symbol rows. */
function symbolRowPath(filePath: string, line: number): string {
  const parts = filePath.split("/");
  const tail = parts[parts.length - 1] ?? filePath;
  return `${tail}:${line}`;
}
