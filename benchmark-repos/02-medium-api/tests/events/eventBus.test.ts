import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/events/eventBus.js';
import { EventHandlers } from '../../src/events/handlers.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should register and emit events', () => {
    const handler = vi.fn();
    eventBus.on('test:event', handler);
    eventBus.emit('test:event', { data: 'hello' });
    expect(handler).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('should remove listeners', () => {
    const handler = vi.fn();
    eventBus.on('test:event', handler);
    eventBus.off('test:event', handler);
    eventBus.emit('test:event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple listeners', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.on('multi', handler1);
    eventBus.on('multi', handler2);
    eventBus.emit('multi', {});
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});
