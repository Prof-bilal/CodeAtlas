import { describe, it, expect } from 'vitest';
import {LRUCache, Trie, Graph, Tree, LinkedList, PriorityQueue, Stack, Queue, HashMap, HashSet} from '../../src/utils/dataStructures.js';

describe('Data Structures', () => {
  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('should evict oldest when full', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('Trie', () => {
    it('should insert and search words', () => {
      const trie = new Trie();
      trie.insert('hello');
      trie.insert('help');
      expect(trie.search('hello')).toBe(true);
      expect(trie.search('hell')).toBe(false);
    });
  });

  describe('Graph', () => {
    it('should add vertices and edges', () => {
      const graph = new Graph<string>();
      graph.addVertex('A');
      graph.addVertex('B');
      graph.addEdge('A', 'B');
      expect(graph.getNeighbors('A')).toContain('B');
    });
  });

  describe('Tree', () => {
    it('should build tree', () => {
      const tree = new Tree<number>(1);
      tree.root.addChild(2);
      tree.root.addChild(3);
      expect(tree.root.children.length).toBe(2);
    });
  });

  describe('Stack', () => {
    it('should push and pop', () => {
      const stack = new Stack<number>();
      stack.push(1);
      stack.push(2);
      expect(stack.pop()).toBe(2);
      expect(stack.pop()).toBe(1);
    });
  });

  describe('Queue', () => {
    it('should enqueue and dequeue', () => {
      const queue = new Queue<number>();
      queue.enqueue(1);
      queue.enqueue(2);
      expect(queue.dequeue()).toBe(1);
      expect(queue.dequeue()).toBe(2);
    });
  });

  describe('PriorityQueue', () => {
    it('should dequeue by priority', () => {
      const pq = new PriorityQueue<string>();
      pq.enqueue('low', 3);
      pq.enqueue('high', 1);
      pq.enqueue('medium', 2);
      expect(pq.dequeue()).toBe('high');
      expect(pq.dequeue()).toBe('medium');
    });
  });

  describe('HashMap', () => {
    it('should set and get', () => {
      const map = new HashMap<string, number>();
      map.set('a', 1);
      expect(map.get('a')).toBe(1);
    });
  });

  describe('HashSet', () => {
    it('should add and check membership', () => {
      const set = new HashSet<string>();
      set.add('a');
      expect(set.has('a')).toBe(true);
      expect(set.has('b')).toBe(false);
    });
  });
});
