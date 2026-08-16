// Module B - imports Module A
// Circular dependency!

import { functionA1, functionA2 } from './moduleA';

export function functionB1(): string {
  return 'Function B1 calls: ' + functionA1();
}

export function functionB2(): string {
  return 'Function B2 calls: ' + functionA2();
}

export function functionB3(): string {
  return 'B3 -> A2 -> B1 -> A1';
}

// This creates a circular dependency with moduleA.ts
// In practice this causes issues with initialization order
// and can lead to undefined values at import time
// TODO: refactor to break the cycle
