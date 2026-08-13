import * as vscode from "vscode";
import { runAtlas } from "./atlas-cli";
import { ContextClient } from "./client";
import type { AtlasRunner } from "./commands";
import { activateExtension } from "./extension-core";
import type {
  VscodeApi,
  VscodeDisposable,
  VscodeStatusBarItem,
  VscodeTerminal,
  VscodeTreeDataProvider,
  VscodeTreeItemBase,
  VscodeViewRegistrar,
  VscodeWebviewView,
  VscodeWebviewViewProvider,
  VscodeWindow,
  VscodeWorkspace,
} from "./vscode-host";

/**
 * The real VS Code entry point. Everything below this file runs headless-ly in
 * tests; this file is the only place that touches the `vscode` module.
 */

/** The workspace root the extension serves: first folder, else ATLAS_ROOT/cwd. */
function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder !== undefined) {
    return folder.uri.fsPath;
  }
  if (vscode.workspace.rootPath !== undefined) {
    return vscode.workspace.rootPath;
  }
  return process.env["ATLAS_ROOT"] ?? process.cwd();
}

/** A wrapper element for feeding `VscodeTreeItemBase` values to VS Code. */
interface AtlasTreeElement {
  readonly item: VscodeTreeItemBase;
}

/** Convert a `VscodeTreeItemBase` into a real `vscode.TreeItem`. */
function toRealTreeItem(item: VscodeTreeItemBase): vscode.TreeItem {
  const treeItem = new vscode.TreeItem(item.label, item.collapsibleState);
  if (item.description !== undefined) {
    treeItem.description = item.description;
  }
  if (item.tooltip !== undefined) {
    treeItem.tooltip = item.tooltip;
  }
  if (item.contextValue !== undefined) {
    treeItem.contextValue = item.contextValue;
  }
  if (item.command !== undefined) {
    const command: vscode.Command = { command: item.command.command, title: item.command.title };
    if (item.command.arguments !== undefined) {
      command.arguments = [...item.command.arguments];
    }
    treeItem.command = command;
  }
  return treeItem;
}

/** Wrap our tree-walker as a real `vscode.TreeDataProvider`. */
function toRealTreeDataProvider(
  source: VscodeTreeDataProvider<VscodeTreeItemBase>,
): vscode.TreeDataProvider<AtlasTreeElement> {
  const emitter = new vscode.EventEmitter<AtlasTreeElement | undefined>();
  source.onDidChangeTreeData?.(() => {
    emitter.fire(undefined);
  });
  return {
    onDidChangeTreeData: emitter.event,
    getTreeItem: (element: AtlasTreeElement) => toRealTreeItem(element.item),
    getChildren: async (element?: AtlasTreeElement) => {
      const children = await source.getChildren(element?.item);
      return children.map((item) => ({ item }));
    },
  };
}

/** The `window` fragment of the `vscode` API, narrowed to what we use. */
function buildWindow(): VscodeWindow {
  return {
    createOutputChannel: (name) => vscode.window.createOutputChannel(name),
    createStatusBarItem: (id, alignment, priority) => {
      // VS Code's overloads are `(id, alignment?, priority?)` and `(alignment?, priority?)`.
      const align = alignment ?? vscode.StatusBarAlignment.Left;
      const prio = priority ?? 0;
      const item =
        id === undefined
          ? vscode.window.createStatusBarItem(align, prio)
          : vscode.window.createStatusBarItem(id, align, prio);
      return item as unknown as VscodeStatusBarItem;
    },
    showInformationMessage: async (message) => {
      await vscode.window.showInformationMessage(message);
    },
    showErrorMessage: async (message) => {
      await vscode.window.showErrorMessage(message);
    },
    showWarningMessage: async (message) => {
      await vscode.window.showWarningMessage(message);
    },
    showQuickPick: async (items, options) => {
      const picked =
        options === undefined
          ? await vscode.window.showQuickPick(items)
          : await vscode.window.showQuickPick(items, options);
      return picked ?? undefined;
    },
    showTextDocument: async (path, line) => {
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      if (line !== undefined) {
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
    },
  };
}

/** The `workspace` fragment of the `vscode` API, narrowed to what we use. */
function buildWorkspace(): VscodeWorkspace {
  const folders = vscode.workspace.workspaceFolders?.map((folder) => ({
    uri: { fsPath: folder.uri.fsPath },
  }));
  const rootPath = vscode.workspace.rootPath;
  return {
    ...(folders !== undefined ? { workspaceFolders: folders } : {}),
    ...(rootPath !== undefined ? { rootPath } : {}),
    getConfiguration: (section) => {
      const configuration = vscode.workspace.getConfiguration(section);
      return { get: (key, defaultValue) => configuration.get(key, defaultValue) };
    },
    updateConfiguration: async (section, key, value) => {
      await vscode.workspace.getConfiguration(section).update(key, value);
    },
  };
}

/** The registration surface of the `vscode` API, narrowed to what we use. */
function buildViews(): VscodeViewRegistrar {
  return {
    createTreeView: (viewId, options) =>
      vscode.window.createTreeView<AtlasTreeElement>(viewId, {
        treeDataProvider: toRealTreeDataProvider(options.treeDataProvider),
      }) as unknown as VscodeDisposable,
    registerTreeDataProvider: (viewId, provider) =>
      vscode.window.registerTreeDataProvider(viewId, toRealTreeDataProvider(provider)),
    registerCommand: (command, handler) => vscode.commands.registerCommand(command, handler),
  };
}

/** Wrap a real `vscode.Terminal` behind the injectable terminal interface. */
function toRealTerminal(terminal: vscode.Terminal): VscodeTerminal {
  return {
    name: terminal.name,
    sendText: (text, addNewLine) => terminal.sendText(text, addNewLine),
    show: (preserveFocus) => terminal.show(preserveFocus),
    dispose: () => terminal.dispose(),
    // `Terminal.onDidWriteData` is a real but newer API; the stable types for
    // the 1.92 engine do not declare it. Probe for it at runtime and degrade
    // to a no-op subscription when unavailable (the terminal panel itself
    // still shows the agent's output natively).
    onDidWriteData: (listener) => {
      const terminalWithEvent = terminal as unknown as {
        readonly onDidWriteData?: (listener: (data: string) => void) => vscode.Disposable;
      };
      return terminalWithEvent.onDidWriteData !== undefined
        ? terminalWithEvent.onDidWriteData(listener)
        : { dispose: () => undefined };
    },
    onDidClose: (listener) =>
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          listener();
        }
      }),
  };
}

/** Wrap a real `vscode.WebviewView` behind the injectable webview interface. */
function toRealWebviewView(webviewView: vscode.WebviewView): VscodeWebviewView {
  return {
    webview: {
      get cspSource() {
        return webviewView.webview.cspSource;
      },
      get html() {
        return webviewView.webview.html;
      },
      set html(value) {
        webviewView.webview.html = value;
      },
      postMessage: async (message) => await webviewView.webview.postMessage(message),
      onDidReceiveMessage: (listener) => webviewView.webview.onDidReceiveMessage(listener),
    },
    onDidDispose: (listener) => webviewView.onDidDispose(listener),
    show: (preserveFocus) => webviewView.show(preserveFocus),
  };
}

/** The terminal surface of the `vscode` API, narrowed to what we use. */
function buildTerminals(): VscodeApi["terminals"] {
  return {
    createTerminal: (options) =>
      toRealTerminal(
        vscode.window.createTerminal({
          name: options.name,
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        }),
      ),
  };
}

/** The webview-view registration surface of the `vscode` API. */
function buildWebview(): VscodeApi["webview"] {
  return {
    registerWebviewViewProvider: (viewType, provider) =>
      vscode.window.registerWebviewViewProvider(viewType, {
        resolveWebviewView: (webviewView) =>
          (provider as VscodeWebviewViewProvider).resolveWebviewView(
            toRealWebviewView(webviewView),
          ),
      }),
  };
}

/** Assemble the real `vscode` API behind the injectable interface. */
function realHost(): VscodeApi {
  return {
    window: buildWindow(),
    workspace: buildWorkspace(),
    views: buildViews(),
    terminals: buildTerminals(),
    webview: buildWebview(),
    commands: {
      executeCommand: async (command, ...rest) => {
        await vscode.commands.executeCommand(command, ...rest);
      },
    },
    env: { machineId: vscode.env.machineId },
  };
}

/** Entry point: activate the extension against the real host. */
export function activate(context: vscode.ExtensionContext): void {
  const projectRoot = workspaceRoot();
  const host = realHost();
  const client = new ContextClient({ repositoryPath: projectRoot });

  const runner: AtlasRunner = {
    run: async (action) => {
      const result = await runAtlas({ projectRoot, command: action });
      const ok = result.exitCode === 0;
      const summary =
        (ok && result.stdout.trim()) || result.stderr.trim() || `exit ${result.exitCode}`;
      return { ok, summary };
    },
  };

  const extension = activateExtension({ client, host, runner });
  context.subscriptions.push({
    dispose: () => {
      extension.dispose();
      client.close();
    },
  });
}

/** Deactivate hook; the SDK session is closed by the activation disposable. */
export function deactivate(): void {}
