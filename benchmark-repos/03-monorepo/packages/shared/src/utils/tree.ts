export interface TreeNode<T = unknown> {
  id: string;
  data: T;
  children: TreeNode<T>[];
  parent?: TreeNode<T>;
}

export function createTreeNode<T>(id: string, data: T): TreeNode<T> {
  return { id, data, children: [] };
}

export function addChild<T>(parent: TreeNode<T>, child: TreeNode<T>): void {
  child.parent = parent;
  parent.children.push(child);
}

export function removeChild<T>(parent: TreeNode<T>, childId: string): boolean {
  const index = parent.children.findIndex(c => c.id === childId);
  if (index > -1) {
    parent.children[index].parent = undefined;
    parent.children.splice(index, 1);
    return true;
  }
  return false;
}

export function findNode<T>(root: TreeNode<T>, id: string): TreeNode<T> | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function findNodeByPredicate<T>(
  root: TreeNode<T>,
  predicate: (node: TreeNode<T>) => boolean
): TreeNode<T> | undefined {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findNodeByPredicate(child, predicate);
    if (found) return found;
  }
  return undefined;
}

export function getDepth<T>(node: TreeNode<T>): number {
  let depth = 0;
  let current = node;
  while (current.parent) {
    depth++;
    current = current.parent;
  }
  return depth;
}

export function getHeight<T>(node: TreeNode<T>): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getHeight));
}

export function getSiblings<T>(node: TreeNode<T>): TreeNode<T>[] {
  if (!node.parent) return [];
  return node.parent.children.filter(c => c.id !== node.id);
}

export function getAncestors<T>(node: TreeNode<T>): TreeNode<T>[] {
  const ancestors: TreeNode<T>[] = [];
  let current = node.parent;
  while (current) {
    ancestors.push(current);
    current = current.parent;
  }
  return ancestors;
}

export function getDescendants<T>(node: TreeNode<T>): TreeNode<T>[] {
  const descendants: TreeNode<T>[] = [];
  for (const child of node.children) {
    descendants.push(child);
    descendants.push(...getDescendants(child));
  }
  return descendants;
}

export function getLeaves<T>(node: TreeNode<T>): TreeNode<T>[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(getLeaves);
}

export function map<T, U>(node: TreeNode<T>, fn: (node: TreeNode<T>) => U): TreeNode<U> {
  const newNode: TreeNode<U> = {
    id: node.id,
    data: fn(node),
    children: node.children.map(child => map(child, fn)),
  };
  for (const child of newNode.children) {
    child.parent = newNode;
  }
  return newNode;
}

export function filter<T>(node: TreeNode<T>, predicate: (node: TreeNode<T>) => boolean): TreeNode<T>[] {
  const result: TreeNode<T>[] = [];
  if (predicate(node)) result.push(node);
  for (const child of node.children) {
    result.push(...filter(child, predicate));
  }
  return result;
}

export function flatten<T>(node: TreeNode<T>): TreeNode<T>[] {
  return [node, ...node.children.flatMap(flatten)];
}

export function toArray<T>(root: TreeNode<T>): T[] {
  return flatten(root).map(n => n.data);
}

export function getLevel<T>(root: TreeNode<T>, level: number): TreeNode<T>[] {
  if (level === 0) return [root];
  return root.children.flatMap(child => getLevel(child, level - 1));
}

export function moveNode<T>(node: TreeNode<T>, newParent: TreeNode<T>): void {
  if (node.parent) {
    removeChild(node.parent, node.id);
  }
  addChild(newParent, node);
}

export function cloneTree<T>(node: TreeNode<T>): TreeNode<T> {
  const cloned: TreeNode<T> = {
    id: node.id,
    data: node.data,
    children: node.children.map(cloneTree),
  };
  for (const child of cloned.children) {
    child.parent = cloned;
  }
  return cloned;
}
