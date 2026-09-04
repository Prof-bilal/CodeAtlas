import { describe, it, expect } from 'vitest';
import { Graph } from '../../src/utils/graph.js';

describe('Graph', () => {
  it('should add vertices and edges', () => {
    const graph = new Graph<string>();
    graph.addVertex('A');
    graph.addVertex('B');
    graph.addEdge('A', 'B');

    expect(graph.getNeighbors('A')).toContain('B');
    expect(graph.getNeighbors('B')).toContain('A');
  });

  it('should remove vertices', () => {
    const graph = new Graph<string>();
    graph.addVertex('A');
    graph.addVertex('B');
    graph.addEdge('A', 'B');
    graph.removeVertex('A');

    expect(graph.hasVertex('A')).toBe(false);
  });

  it('should detect cycles', () => {
    const graph = new Graph<string>();
    graph.addVertex('A');
    graph.addVertex('B');
    graph.addVertex('C');
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('C', 'A');

    expect(graph.hasCycle()).toBe(true);
  });

  it('should do BFS', () => {
    const graph = new Graph<string>();
    graph.addVertex('A');
    graph.addVertex('B');
    graph.addVertex('C');
    graph.addEdge('A', 'B');
    graph.addEdge('A', 'C');

    const result = graph.bfs('A');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });
});
