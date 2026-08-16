import { describe, it, expect } from 'vitest';
import { GraphUtils, topologicalSort, shortestPath, detectCycle, findConnectedComponents } from '../../src/utils/graphUtils.js';

describe('Graph Utils', () => {
  describe('topologicalSort', () => {
    it('should sort graph topologically', () => {
      const graph: Record<string, string[]> = {
        A: ['B', 'C'],
        B: ['D'],
        C: ['D'],
        D: [],
      };
      const result = topologicalSort(graph);
      expect(result).toContain('A');
      expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
    });
  });

  describe('shortestPath', () => {
    it('should find shortest path', () => {
      const graph: Record<string, string[]> = {
        A: ['B', 'C'],
        B: ['D'],
        C: ['D'],
        D: [],
      };
      const result = shortestPath(graph, 'A', 'D');
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe('detectCycle', () => {
    it('should detect cycle', () => {
      const graph: Record<string, string[]> = {
        A: ['B'],
        B: ['C'],
        C: ['A'],
      };
      expect(detectCycle(graph)).toBe(true);
    });

    it('should detect no cycle', () => {
      const graph: Record<string, string[]> = {
        A: ['B'],
        B: ['C'],
        C: [],
      };
      expect(detectCycle(graph)).toBe(false);
    });
  });

  describe('findConnectedComponents', () => {
    it('should find components', () => {
      const graph: Record<string, string[]> = {
        A: ['B'],
        B: ['A'],
        C: ['D'],
        D: ['C'],
      };
      const components = findConnectedComponents(graph);
      expect(components.length).toBe(2);
    });
  });
});
