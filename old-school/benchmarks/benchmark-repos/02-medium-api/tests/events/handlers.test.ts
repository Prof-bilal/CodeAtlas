import { describe, it, expect } from 'vitest';
import { EventHandlers } from '../../src/events/handlers.js';

describe('EventHandlers', () => {
  it('should have handler for user events', () => {
    expect(EventHandlers.user).toBeDefined();
    expect(typeof EventHandlers.user.created).toBe('function');
    expect(typeof EventHandlers.user.updated).toBe('function');
    expect(typeof EventHandlers.user.deleted).toBe('function');
  });

  it('should have handler for task events', () => {
    expect(EventHandlers.task).toBeDefined();
    expect(typeof EventHandlers.task.created).toBe('function');
    expect(typeof EventHandlers.task.completed).toBe('function');
  });

  it('should have handler for payment events', () => {
    expect(EventHandlers.payment).toBeDefined();
    expect(typeof EventHandlers.payment.completed).toBe('function');
    expect(typeof EventHandlers.payment.failed).toBe('function');
  });
});
