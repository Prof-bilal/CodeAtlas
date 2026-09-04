export interface GraphNode<T = string> {
  id: T;
  data?: unknown;
  edges: T[];
}

export class Graph<T = string> {
  private nodes: Map<T, GraphNode<T>> = new Map();
  private directed: boolean;

  constructor(directed: boolean = true) {
    this.directed = directed;
  }

  addNode(id: T, data?: unknown): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, data, edges: [] });
    }
  }

  addEdge(from: T, to: T): void {
    this.addNode(from);
    this.addNode(to);
    const fromNode = this.nodes.get(from)!;
    if (!fromNode.edges.includes(to)) {
      fromNode.edges.push(to);
    }
    if (!this.directed) {
      const toNode = this.nodes.get(to)!;
      if (!toNode.edges.includes(from)) {
        toNode.edges.push(from);
      }
    }
  }

  removeNode(id: T): boolean {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);
    for (const node of this.nodes.values()) {
      node.edges = node.edges.filter(e => e !== id);
    }
    return true;
  }

  removeEdge(from: T, to: T): void {
    const fromNode = this.nodes.get(from);
    if (fromNode) fromNode.edges = fromNode.edges.filter(e => e !== to);
    if (!this.directed) {
      const toNode = this.nodes.get(to);
      if (toNode) toNode.edges = toNode.edges.filter(e => e !== from);
    }
  }

  getNode(id: T): GraphNode<T> | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: T): boolean {
    return this.nodes.has(id);
  }

  hasEdge(from: T, to: T): boolean {
    const fromNode = this.nodes.get(from);
    return fromNode ? fromNode.edges.includes(to) : false;
  }

  getNeighbors(id: T): T[] {
    return this.nodes.get(id)?.edges || [];
  }

  getNodes(): GraphNode<T>[] {
    return Array.from(this.nodes.values());
  }

  getSize(): number {
    return this.nodes.size;
  }

  bfs(start: T, callback: (node: GraphNode<T>) => void): void {
    const visited = new Set<T>();
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (node) {
        callback(node);
        for (const neighbor of node.edges) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
  }

  dfs(start: T, callback: (node: GraphNode<T>) => void): void {
    const visited = new Set<T>();
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) {
        callback(node);
        for (const neighbor of node.edges) {
          if (!visited.has(neighbor)) stack.push(neighbor);
        }
      }
    }
  }

  hasCycle(): boolean {
    const visited = new Set<T>();
    const recursionStack = new Set<T>();
    for (const node of this.nodes.values()) {
      if (this.hasCycleUtil(node.id, visited, recursionStack)) return true;
    }
    return false;
  }

  private hasCycleUtil(id: T, visited: Set<T>, recursionStack: Set<T>): boolean {
    visited.add(id);
    recursionStack.add(id);
    const node = this.nodes.get(id);
    if (node) {
      for (const neighbor of node.edges) {
        if (!visited.has(neighbor)) {
          if (this.hasCycleUtil(neighbor, visited, recursionStack)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }
    }
    recursionStack.delete(id);
    return false;
  }

  topologicalSort(): T[] {
    const visited = new Set<T>();
    const result: T[] = [];
    for (const node of this.nodes.values()) {
      if (!visited.has(node.id)) {
        this.topologicalSortUtil(node.id, visited, result);
      }
    }
    return result.reverse();
  }

  private topologicalSortUtil(id: T, visited: Set<T>, result: T[]): void {
    visited.add(id);
    const node = this.nodes.get(id);
    if (node) {
      for (const neighbor of node.edges) {
        if (!visited.has(neighbor)) {
          this.topologicalSortUtil(neighbor, visited, result);
        }
      }
    }
    result.push(id);
  }
}

export function createGraph<T>(directed?: boolean): Graph<T> {
  return new Graph<T>(directed);
}
