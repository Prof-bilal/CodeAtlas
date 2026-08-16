import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../../src/utils/priorityQueue.js';

describe('PriorityQueue', () => {
  it('should dequeue by priority', () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue('low', 10);
    pq.enqueue('high', 1);
    pq.enqueue('medium', 5);
    expect(pq.dequeue()).toBe('high');
    expect(pq.dequeue()).toBe('medium');
    expect(pq.dequeue()).toBe('low');
  });

  it('should handle same priority', () => {
    const pq = new PriorityQueue<number>();
    pq.enqueue(1, 5);
    pq.enqueue(2, 5);
    expect(pq.size).toBe(2);
  });

  it('should return size', () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue('a', 1);
    pq.enqueue('b', 2);
    expect(pq.size).toBe(2);
  });

  it('should check if empty', () => {
    const pq = new PriorityQueue<string>();
    expect(pq.isEmpty).toBe(true);
    pq.enqueue('a', 1);
    expect(pq.isEmpty).toBe(false);
  });
});
