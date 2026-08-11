import type { ContextClient } from "./client";
import { isUnavailable } from "./client";
import {
  dependencyEdgeNodes,
  dependencyGroupNodes,
  languageChildren,
  moduleFileNodes,
  moduleNodes,
  projectOverviewChildren,
  projectRootNode,
  summaryNodes,
  symbolGroupNodes,
  symbolRowsForKind,
} from "./ui/nodes";
import type { VscodeDisposable, VscodeTreeDataProvider, VscodeTreeItemBase } from "./vscode-host";

/**
 * The five tree views the extension registers. Each id matches a
 * `contributes.views` entry grouped under the `codeatlas` activity-bar container
 * in package.json.
 */
export type TreeViewId =
  | "codeatlas.project"
  | "codeatlas.symbols"
  | "codeatlas.modules"
  | "codeatlas.summaries"
  | "codeatlas.dependencies";

/** Every contributed view, in registration order. */
export const TREE_VIEWS: readonly TreeViewId[] = [
  "codeatlas.project",
  "codeatlas.symbols",
  "codeatlas.modules",
  "codeatlas.summaries",
  "codeatlas.dependencies",
];

/**
 * Compute the children of a tree node for a view. Everything hangs off the node's
 * `contextValue`, so the providers are purely data-driven and unit-testable
 * against a {@link ContextClient}.
 */
export function childrenOf(
  client: ContextClient,
  view: TreeViewId,
  parent?: VscodeTreeItemBase,
): readonly VscodeTreeItemBase[] {
  try {
    return parent === undefined ? rootChildren(client, view) : nodeChildren(client, parent);
  } catch (error) {
    // No index yet (or an index that was removed) is a UI state, not a crash.
    if (isUnavailable(error)) {
      return emptyChildren();
    }
    throw error;
  }
}

/** The top-level rows of a view. */
function rootChildren(client: ContextClient, view: TreeViewId): readonly VscodeTreeItemBase[] {
  switch (view) {
    case "codeatlas.project":
      return [projectRootNode(client.overview())];
    case "codeatlas.symbols":
      return symbolGroupNodes(client.listSymbols());
    case "codeatlas.modules":
      return moduleNodes(client.modules());
    case "codeatlas.summaries":
      return summaryNodes(client.summaries());
    case "codeatlas.dependencies":
      return dependencyGroupNodes(client.dependencies());
  }
}

/** Children of a non-root node, keyed by `contextValue`. */
function nodeChildren(
  client: ContextClient,
  parent: VscodeTreeItemBase,
): readonly VscodeTreeItemBase[] {
  switch (parent.contextValue) {
    case "codeatlas.project":
      return projectOverviewChildren(client.overview());
    case "codeatlas.languages":
      return languageChildren(client.overview());
    case "codeatlas.symbol-group":
      return symbolRowsForKind(parent.label, client.listSymbols());
    case "codeatlas.module":
      return moduleFileNodes(parent.description ?? parent.label, client.listFiles());
    case "codeatlas.dep-source":
      return dependencyEdgeNodes(parent.label, client.dependencies());
    default:
      return [];
  }
}

/** Shown when the workspace has no CodeAtlas index yet. */
function emptyChildren(): readonly VscodeTreeItemBase[] {
  return [
    {
      label: "No CodeAtlas index in this workspace",
      description: "Run CodeAtlas: Build to create one",
      collapsibleState: 0,
      contextValue: "codeatlas.empty",
    },
  ];
}

/**
 * One view's tree-walker. Tree nodes are the SDK-derived `VscodeTreeItemBase`
 * themselves, so `getTreeItem` is identity and `getChildren` delegates to
 * {@link childrenOf}. Call {@link refresh} after a build/update so the UI
 * re-reads the index.
 */
export class ViewTreeProvider implements VscodeTreeDataProvider<VscodeTreeItemBase> {
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly client: ContextClient,
    public readonly view: TreeViewId,
  ) {}

  public getChildren(element?: VscodeTreeItemBase): readonly VscodeTreeItemBase[] {
    return childrenOf(this.client, this.view, element);
  }

  public getTreeItem(element: VscodeTreeItemBase): VscodeTreeItemBase {
    return element;
  }

  /** Subscribe to content changes; returns a disposable unsubscribe. */
  public onDidChangeTreeData(listener: () => void): VscodeDisposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /** Notify subscribers that the tree's data changed. */
  public refresh(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Register a provider for every contributed view; returns a single dispose. */
export function createViewProviders(
  client: ContextClient,
  register: (view: TreeViewId, provider: ViewTreeProvider) => VscodeDisposable,
): VscodeDisposable {
  const disposables = TREE_VIEWS.map((view) => register(view, new ViewTreeProvider(client, view)));
  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}
