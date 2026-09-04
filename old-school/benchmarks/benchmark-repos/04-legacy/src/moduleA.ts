// Module A - imports Module B
// Circular dependency!

import { functionB1, functionB2 } from './moduleB';

export function functionA1(): string {
  return 'Function A1 calls: ' + functionB1();
}

export function functionA2(): string {
  return 'Function A2 calls: ' + functionB2();
}

export function functionA3(): string {
  // This creates a circular dependency chain
  return 'A3 -> B1 -> A1 -> B2';
}

// This file and moduleB.ts create a circular dependency
// Both export functions that call each other
// TypeScript handles this at runtime but it's bad practice
// TODO: break this circular dependency
