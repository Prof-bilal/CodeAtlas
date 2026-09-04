import { describe, it, expect } from 'vitest';
import { Queue } from '../../src/utils/queue.js';

describe('Queue', () => {
  it('should enqueue and dequeue', () => {
    const queue = new Queue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(queue.dequeue()).toBe(1);
    expect(queue.dequeue()).toBe(2);
    expect(queue.dequeue()).toBe(3);
  });

  it('should peek', () => {
    const queue = new Queue<string>();
    queue.enqueue('hello');
    expect(queue.peek()).toBe('hello');
    expect(queue.size).toBe(1);
  });

  it('should return correct size', () => {
    const queue = new Queue<number>();
    queue.enqueue(10);
    queue.enqueue(20);
    expect(queue.size).toBe(2);
  });

  it('should check if empty', () => {
    const queue = new Queue<number>();
    expect(queue.isEmpty).toBe(true);
    queue.enqueue(1);
    expect(queue.isEmpty).toBe(false);
  });
});
