import type { ContextClient } from "./client";
import { registerCommands, type AtlasRunner } from "./commands";
import { TREE_VIEWS, ViewTreeProvider } from "./providers";
import { StatusBarController } from "./status-bar";
import type { VscodeApi, VscodeDisposable } from "./vscode-host";

/** What the extension needs to boot: a client, a host, and a CLI runner. */
export interface ExtensionDeps {
  readonly client: ContextClient;
  readonly host: VscodeApi;
  readonly runner: AtlasRunner;
}

/**
 * Binds the whole extension: tree views, commands, and the status bar. Only
 * talks to VS Code through the injectable {@link VscodeApi}, so it runs headless
 * in tests behind a fake host.
 */
export class CodeAtlasExtension {
  private readonly disposables: VscodeDisposable[] = [];
  private readonly providers: readonly ViewTreeProvider[];
  private statusBar: StatusBarController | null = null;

  public constructor(private readonly deps: ExtensionDeps) {
    this.providers = TREE_VIEWS.map((view) => new ViewTreeProvider(deps.client, view));
  }

  /** Register everything with the host and render the first status. */
  public activate(): void {
    const { host, client } = this.deps;
    for (const provider of this.providers) {
      this.disposables.push(host.views.registerTreeDataProvider(provider.view, provider));
    }
    const statusItem = host.window.createStatusBarItem("codeatlas.status", 1, 100);
    this.disposables.push(statusItem);
    this.statusBar = new StatusBarController(statusItem);

    const commands = registerCommands({
      client,
      host,
      runner: this.deps.runner,
      refreshAll: () => this.refresh(),
    });
    for (const command of commands) {
      this.disposables.push(command);
    }

    this.refresh();
  }

  /**
   * Re-read the on-disk index (after a build/update) and redraw every surface.
   * Dropping the SDK session first means a newly created `.codeatlas/context.db`
   * is visible on the next read.
   */
  public refresh(): void {
    this.deps.client.reload();
    for (const provider of this.providers) {
      provider.refresh();
    }
    this.statusBar?.render(this.deps.client);
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.deps.client.close();
  }
}

/** Activate the extension: build it from deps and register everything. */
export function activateExtension(deps: ExtensionDeps): CodeAtlasExtension {
  const extension = new CodeAtlasExtension(deps);
  extension.activate();
  return extension;
}
