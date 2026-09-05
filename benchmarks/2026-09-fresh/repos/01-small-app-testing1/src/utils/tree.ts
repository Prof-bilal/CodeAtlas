export interface TreeNode<T> {
  value: T;
  children: TreeNode<T>[];
  parent?: TreeNode<T>;
}

export function createTreeNode<T>(value: T): TreeNode<T> {
  return {
    value,
    children: [],
  };
}

export function addChild<T>(parent: TreeNode<T>, child: TreeNode<T>): void {
  child.parent = parent;
  parent.children.push(child);
}

export function removeChild<T>(parent: TreeNode<T>, child: TreeNode<T>): void {
  const index = parent.children.indexOf(child);
  if (index !== -1) {
    parent.children.splice(index, 1);
    child.parent = undefined;
  }
}

export function findNode<T>(root: TreeNode<T>, predicate: (value: T) => boolean): TreeNode<T> | null {
  if (predicate(root.value)) {
    return root;
  }
  
  for (const child of root.children) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }
  
  return null;
}

export function traversePreOrder<T>(node: TreeNode<T>, callback: (value: T) => void): void {
  callback(node.value);
  
  for (const child of node.children) {
    traversePreOrder(child, callback);
  }
}

export function traversePostOrder<T>(node: TreeNode<T>, callback: (value: T) => void): void {
  for (const child of node.children) {
    traversePostOrder(child, callback);
  }
  
  callback(node.value);
}

export function getHeight<T>(node: TreeNode<T>): number {
  if (node.children.length === 0) {
    return 0;
  }
  
  return 1 + Math.max(...node.children.map(getHeight));
}

export function getDepth<T>(node: TreeNode<T>): number {
  let depth = 0;
  let current = node.parent;
  
  while (current) {
    depth++;
    current = current.parent;
  }
  
  return depth;
}

export function toArray<T>(root: TreeNode<T>): T[] {
  const result: T[] = [];
  traversePreOrder(root, (value) => result.push(value));
  return result;
}
