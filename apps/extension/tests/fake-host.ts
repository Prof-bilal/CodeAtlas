import type {
  VscodeApi,
  VscodeDisposable,
  VscodeQuickPickItem,
  VscodeStatusBarItem,
  VscodeViewRegistrar,
  VscodeWindow,
} from "../src/vscode-host";

/** Everything the fake host records as the extension runs. */
export interface FakeHostRecords {
  readonly registeredViews: Set<string>;
  readonly registeredCommands: Map<string, (...args: unknown[]) => unknown>;
  readonly messages: string[];
  readonly openedDocs: { readonly path: string; readonly line?: number }[];
  readonly quickPickItems: VscodeQuickPickItem[];
  readonly statusBarItems: FakeStatusBarItem[];
  /** What `showQuickPick` resolves to; defaults to the first item. */
  quickPickResult: VscodeQuickPickItem | undefined;
}

/** A fake status-bar item backed by a class so `tooltip`/`command` can be unset. */
export class FakeStatusBarItem implements VscodeStatusBarItem {
  public text = "";
  public tooltip = "";
  public command = "";
  private visible = false;

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public dispose(): void {
    this.visible = false;
  }

  public get shown(): boolean {
    return this.visible;
  }
}

/** Create a fake status-bar item. */
export function fakeStatusBarItem(): FakeStatusBarItem {
  return new FakeStatusBarItem();
}

/** A fully fake `VscodeApi` host, injectable into the extension core. */
export function createFakeHost(): { readonly host: VscodeApi; readonly records: FakeHostRecords } {
  const records: FakeHostRecords = {
    registeredViews: new Set<string>(),
    registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
    messages: [],
    openedDocs: [],
    quickPickItems: [],
    statusBarItems: [],
    quickPickResult: undefined,
  };

  const window: VscodeWindow = {
    createOutputChannel: (name) => ({
      appendLine: (value) => records.messages.push(`[${name}] ${value}`),
      clear: (): void => undefined,
      show: (): void => undefined,
      dispose: (): void => undefined,
    }),
    createStatusBarItem: () => {
      const item = fakeStatusBarItem();
      records.statusBarItems.push(item);
      return item;
    },
    showInformationMessage: async (message) => {
      records.messages.push(`info: ${message}`);
    },
    showErrorMessage: async (message) => {
      records.messages.push(`error: ${message}`);
    },
    showWarningMessage: async (message) => {
      records.messages.push(`warn: ${message}`);
    },
    showQuickPick: async (items) => {
      records.quickPickItems.push(...items);
      return records.quickPickResult ?? items[0];
    },
    showTextDocument: async (path, line) => {
      records.openedDocs.push({ path, ...(line === undefined ? {} : { line }) });
    },
  };

  const views: VscodeViewRegistrar = {
    createTreeView: () => noopDisposable(),
    registerTreeDataProvider: (viewId) => {
      records.registeredViews.add(viewId);
      return noopDisposable();
    },
    registerCommand: (command, handler) => {
      records.registeredCommands.set(command, handler);
      return noopDisposable();
    },
  };

  return {
    host: {
      window,
      workspace: { workspaceFolders: [] },
      views,
      commands: {
        executeCommand: async (): Promise<void> => undefined,
      },
      env: { machineId: "test-machine" },
    },
    records,
  };
}

function noopDisposable(): VscodeDisposable {
  return { dispose: (): void => undefined };
}
