import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/events/eventBus.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should publish and subscribe to events', async () => {
    const handler = {
      handle: vi.fn(),
    };

    eventBus.subscribe('test.event', handler);
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(handler.handle).toHaveBeenCalled();
  });

  it('should handle multiple subscribers', async () => {
    const handler1 = { handle: vi.fn() };
    const handler2 = { handle: vi.fn() };

    eventBus.subscribe('test.event', handler1);
    eventBus.subscribe('test.event', handler2);
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(handler1.handle).toHaveBeenCalled();
    expect(handler2.handle).toHaveBeenCalled();
  });

  it('should unsubscribe from events', async () => {
    const handler = { handle: vi.fn() };

    eventBus.subscribe('test.event', handler);
    eventBus.unsubscribe('test.event', handler);
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('should handle errors in handlers', async () => {
    const failingHandler = {
      handle: vi.fn().mockRejectedValue(new Error('Handler error')),
    };
    const successHandler = { handle: vi.fn() };

    eventBus.subscribe('test.event', failingHandler);
    eventBus.subscribe('test.event', successHandler);
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(failingHandler.handle).toHaveBeenCalled();
    expect(successHandler.handle).toHaveBeenCalled();
  });

  it('should store events', async () => {
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    const events = eventBus.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('test.event');
  });

  it('should filter events by type', async () => {
    await eventBus.publish('test.event', { data: 'test1' }, 'test');
    await eventBus.publish('other.event', { data: 'test2' }, 'test');
    await eventBus.publish('test.event', { data: 'test3' }, 'test');

    const testEvents = eventBus.getEvents('test.event');
    expect(testEvents).toHaveLength(2);
  });

  it('should return stats', async () => {
    await eventBus.publish('test.event', { data: 'test1' }, 'test');
    await eventBus.publish('test.event', { data: 'test2' }, 'test');
    await eventBus.publish('other.event', { data: 'test3' }, 'test');

    const stats = eventBus.getStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.eventsByType['test.event']).toBe(2);
    expect(stats.eventsByType['other.event']).toBe(1);
  });

  it('should emit eventPublished event', async () => {
    const publishedHandler = { handle: vi.fn() };
    eventBus.on('eventPublished', publishedHandler.handle);

    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(publishedHandler.handle).toHaveBeenCalled();
  });
});
