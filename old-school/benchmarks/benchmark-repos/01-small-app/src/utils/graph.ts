export function topologicalSort<T>(
  nodes: T[],
  edges: [T, T][]
): T[] {
  const adjacencyList = new Map<T, T[]>();
  const inDegree = new Map<T, number>();
  
  for (const node of nodes) {
    adjacencyList.set(node, []);
    inDegree.set(node, 0);
  }
  
  for (const [from, to] of edges) {
    adjacencyList.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
  }
  
  const queue: T[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  
  const result: T[] = [];
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    
    for (const neighbor of adjacencyList.get(node)!) {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  if (result.length !== nodes.length) {
    throw new Error('Cycle detected in graph');
  }
  
  return result;
}
