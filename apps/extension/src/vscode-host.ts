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

/** Every `vscode.*` the extension relies on, as an injectable interface. */
export interface VscodeApi {
  readonly window: VscodeWindow;
  readonly workspace: VscodeWorkspace;
  readonly views: VscodeViewRegistrar;
  readonly commands: {
    readonly executeCommand: (command: string, ...rest: unknown[]) => Promise<unknown>;
  };
  readonly env: { readonly machineId?: string };
}

/** A disposable that does nothing — used by fakes. */
export function noopDisposable(): VscodeDisposable {
  return { dispose: () => undefined };
}
