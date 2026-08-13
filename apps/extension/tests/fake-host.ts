import type {
  VscodeApi,
  VscodeDisposable,
  VscodeQuickPickItem,
  VscodeStatusBarItem,
  VscodeTerminal,
  VscodeViewRegistrar,
  VscodeWebview,
  VscodeWebviewView,
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
  readonly createdTerminals: FakeVscodeTerminal[];
  readonly registeredWebviewViews: Set<string>;
  /** Every `executeCommand` invocation (name + args). */
  readonly executedCommands: { readonly command: string; readonly args: readonly unknown[] }[];
  /** The `codeatlas.*` configuration values, keyed by bare key name. */
  readonly config: Map<string, unknown>;
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

/** A fake integrated terminal; tests drive `emitData`/`emitClose`. */
export class FakeVscodeTerminal implements VscodeTerminal {
  public readonly sentText: { readonly text: string; readonly addNewLine?: boolean }[] = [];
  public disposed = false;
  public shownCount = 0;
  private readonly writeListeners = new Set<(data: string) => void>();
  private readonly closeListeners = new Set<() => void>();

  public constructor(public readonly name: string) {}

  public sendText(text: string, addNewLine?: boolean): void {
    this.sentText.push(addNewLine === undefined ? { text } : { text, addNewLine });
  }

  public show(): void {
    this.shownCount += 1;
  }

  public dispose(): void {
    this.disposed = true;
  }

  public onDidWriteData(listener: (data: string) => void): VscodeDisposable {
    this.writeListeners.add(listener);
    return { dispose: () => this.writeListeners.delete(listener) };
  }

  public onDidClose(listener: () => void): VscodeDisposable {
    this.closeListeners.add(listener);
    return { dispose: () => this.closeListeners.delete(listener) };
  }

  /** Simulate the agent writing to the terminal. */
  public emitData(data: string): void {
    for (const listener of [...this.writeListeners]) {
      listener(data);
    }
  }

  /** Simulate the terminal being closed (process exited / user closed it). */
  public emitClose(): void {
    for (const listener of [...this.closeListeners]) {
      listener();
    }
  }
}

/** A fake webview; tests read `posted` and drive `emitMessage`. */
export class FakeWebview implements VscodeWebview {
  public cspSource = "vscode-webview://test";
  public html = "";
  public readonly posted: unknown[] = [];
  private readonly receiveListeners = new Set<(message: unknown) => void>();

  public async postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message);
    return true;
  }

  public onDidReceiveMessage(listener: (message: unknown) => void): VscodeDisposable {
    this.receiveListeners.add(listener);
    return { dispose: () => this.receiveListeners.delete(listener) };
  }

  /** Simulate the webview sending a message to the extension host. */
  public emitMessage(message: unknown): void {
    for (const listener of [...this.receiveListeners]) {
      listener(message);
    }
  }
}

/** A fake `WebviewView` handed to a provider's `resolveWebviewView`. */
export class FakeWebviewView implements VscodeWebviewView {
  public readonly webview = new FakeWebview();
  public shown = false;
  private readonly disposeListeners = new Set<() => void>();

  public onDidDispose(listener: () => void): VscodeDisposable {
    this.disposeListeners.add(listener);
    return { dispose: () => this.disposeListeners.delete(listener) };
  }

  public show(): void {
    this.shown = true;
  }

  /** Simulate the webview being closed by the user. */
  public emitDispose(): void {
    for (const listener of [...this.disposeListeners]) {
      listener();
    }
  }
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
    createdTerminals: [],
    registeredWebviewViews: new Set<string>(),
    executedCommands: [],
    config: new Map<string, unknown>(),
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
      workspace: {
        workspaceFolders: [],
        getConfiguration: (section) => ({
          get: <T>(key: string, defaultValue?: T): T | undefined => {
            const value = records.config.get(`${section}.${key}`);
            return value === undefined ? defaultValue : (value as T);
          },
        }),
        updateConfiguration: async (section, key, value) => {
          records.config.set(`${section}.${key}`, value);
        },
      },
      views,
      terminals: {
        createTerminal: (options) => {
          const terminal = new FakeVscodeTerminal(options.name);
          records.createdTerminals.push(terminal);
          return terminal;
        },
      },
      webview: {
        registerWebviewViewProvider: (viewType) => {
          records.registeredWebviewViews.add(viewType);
          return noopDisposable();
        },
      },
      commands: {
        executeCommand: async (command, ...args) => {
          records.executedCommands.push({ command, args });
        },
      },
      env: { machineId: "test-machine" },
    },
    records,
  };
}

function noopDisposable(): VscodeDisposable {
  return { dispose: (): void => undefined };
}
