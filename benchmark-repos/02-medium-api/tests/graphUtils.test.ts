import { describe, it, expect } from 'vitest';
import { topologicalSort } from '../src/utils/graph.js';

describe('topologicalSort', () => {
  it('should sort nodes in dependency order', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges: [string, string][] = [['a', 'b'], ['b', 'c'], ['a', 'c']];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
  });
});
