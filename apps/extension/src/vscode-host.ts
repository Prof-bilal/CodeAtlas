/**
 * A tiny, injectable façade over the `vscode` API.
 *
 * The extension only ever touches VS Code through this interface. Tests inject
 * a fake implementation so the extension logic runs headlessly; the real
 * implementation is created in `extension.ts` and simply forwards to `vscode`.
 */

export interface VscodeTreeItemBase {
  readonly label: string;
  readonly description?: string;
  readonly collapsibleState?: 0 | 1 | 2;
  readonly tooltip?: string;
  readonly contextValue?: string;
  readonly command?: {
    readonly command: string;
    readonly title: string;
    readonly arguments?: readonly unknown[];
  };
}

/** The minimal subset of TreeView events we use. */
export interface VscodeTreeDataProvider<T> {
  getChildren(element?: T): readonly T[] | Promise<readonly T[]>;
  getTreeItem(element: T): VscodeTreeItemBase | Promise<VscodeTreeItemBase>;
  readonly onDidChangeTreeData?: (listener: () => void) => VscodeDisposable;
}

export interface VscodeOutputChannel {
  appendLine(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
}

export interface VscodeStatusBarItem {
  text: string;
  tooltip: string;
  command: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface VscodeDisposable {
  dispose(): void;
}

/** One entry of a quick-pick list. */
export interface VscodeQuickPickItem {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

export interface VscodeWindow {
  createOutputChannel(name: string): VscodeOutputChannel;
  createStatusBarItem(id?: string, alignment?: number, priority?: number): VscodeStatusBarItem;
  showInformationMessage(message: string): Promise<void>;
  showErrorMessage(message: string): Promise<void>;
  showWarningMessage(message: string): Promise<void>;
  showQuickPick(
    items: readonly VscodeQuickPickItem[],
    options?: { readonly placeHolder?: string; readonly canPickMany?: boolean },
  ): Promise<VscodeQuickPickItem | undefined>;
  showTextDocument(path: string, line?: number): Promise<void>;
}

export interface VscodeWorkspace {
  readonly workspaceFolders?: readonly { readonly uri: { readonly fsPath: string } }[];
  readonly rootPath?: string;
  /** Read a value from a workspace/user configuration section (e.g. `codeatlas`). */
  readonly getConfiguration?: (section: string) => VscodeConfiguration;
  /** Persist a value into a configuration section (e.g. the default agent). */
  readonly updateConfiguration?: (section: string, key: string, value: unknown) => Promise<void>;
}

/** A minimal read-only view over one configuration section. */
export interface VscodeConfiguration {
  get<T>(key: string, defaultValue?: T): T | undefined;
}

export interface VscodeViewRegistrar {
  createTreeView(
    viewId: string,
    options: { readonly treeDataProvider: VscodeTreeDataProvider<VscodeTreeItemBase> },
  ): VscodeDisposable;
  registerTreeDataProvider(
    viewId: string,
    provider: VscodeTreeDataProvider<VscodeTreeItemBase>,
  ): VscodeDisposable;
  registerCommand(command: string, handler: (...args: unknown[]) => unknown): VscodeDisposable;
  revealCustom?(uri: unknown): void;
}

/** A VS Code integrated terminal, narrowed to what the chat panel uses. */
export interface VscodeTerminal {
  readonly name: string;
  sendText(text: string, addNewLine?: boolean): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
  /** Subscribe to terminal output; returns a disposable unsubscribe. */
  onDidWriteData(listener: (data: string) => void): VscodeDisposable;
  /** Subscribe to the terminal being closed; returns a disposable unsubscribe. */
  onDidClose(listener: () => void): VscodeDisposable;
}

/** Options for {@link VscodeTerminals.createTerminal}. */
export interface VscodeTerminalOptions {
  readonly name: string;
  readonly cwd?: string;
}

/** The terminal-creation surface of the `vscode` API. */
export interface VscodeTerminals {
  createTerminal(options: VscodeTerminalOptions): VscodeTerminal;
}

/** A webview inside a `WebviewView`, narrowed to what the chat panel uses. */
export interface VscodeWebview {
  readonly cspSource: string;
  html: string;
  postMessage(message: unknown): Promise<boolean>;
  onDidReceiveMessage(listener: (message: unknown) => void): VscodeDisposable;
}

/** The `WebviewView` handed to a {@link VscodeWebviewViewProvider}. */
export interface VscodeWebviewView {
  readonly webview: VscodeWebview;
  onDidDispose(listener: () => void): VscodeDisposable;
  show?(preserveFocus?: boolean): void;
}

/** The provider contract for a registered webview view. */
export interface VscodeWebviewViewProvider {
  resolveWebviewView(webviewView: VscodeWebviewView): void | Promise<void>;
}

/** The webview-view registration surface of the `vscode` API. */
export interface VscodeWebviewRegistrar {
  registerWebviewViewProvider(
    viewType: string,
    provider: VscodeWebviewViewProvider,
  ): VscodeDisposable;
}

/** Every `vscode.*` the extension relies on, as an injectable interface. */
export interface VscodeApi {
  readonly window: VscodeWindow;
  readonly workspace: VscodeWorkspace;
  readonly views: VscodeViewRegistrar;
  readonly terminals: VscodeTerminals;
  readonly webview: VscodeWebviewRegistrar;
  readonly commands: {
    readonly executeCommand: (command: string, ...rest: unknown[]) => Promise<unknown>;
  };
  readonly env: { readonly machineId?: string };
}

/** A disposable that does nothing — used by fakes. */
export function noopDisposable(): VscodeDisposable {
  return { dispose: () => undefined };
}
