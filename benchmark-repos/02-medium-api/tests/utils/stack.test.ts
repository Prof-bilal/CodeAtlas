import { describe, it, expect } from 'vitest';
import { Stack } from '../../src/utils/stack.js';

describe('Stack', () => {
  it('should push and pop', () => {
    const stack = new Stack<number>();
    stack.push(1);
    stack.push(2);
    stack.push(3);
    expect(stack.pop()).toBe(3);
    expect(stack.pop()).toBe(2);
    expect(stack.pop()).toBe(1);
  });

  it('should peek', () => {
    const stack = new Stack<number>();
    stack.push(42);
    expect(stack.peek()).toBe(42);
    expect(stack.size).toBe(1);
  });

  it('should return correct size', () => {
    const stack = new Stack<string>();
    stack.push('a');
    stack.push('b');
    expect(stack.size).toBe(2);
  });

  it('should check if empty', () => {
    const stack = new Stack<number>();
    expect(stack.isEmpty).toBe(true);
    stack.push(1);
    expect(stack.isEmpty).toBe(false);
  });
});
