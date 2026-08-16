import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/events/eventBus.js';
import { UserRegisteredHandler, PasswordChangedHandler } from '../src/events/handlers/userHandlers.js';
import { TaskCreatedHandler, TaskCompletedHandler } from '../src/events/handlers/taskHandlers.js';

describe('User Event Handlers', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should handle user registration event', async () => {
    const handler = new UserRegisteredHandler();
    const event = {
      id: 'test-id',
      type: 'user.registered',
      source: 'test',
      data: { userId: 'user-1', email: 'test@example.com', name: 'Test User' },
      timestamp: new Date(),
    };

    await handler.handle(event);
  });

  it('should handle password changed event', async () => {
    const handler = new PasswordChangedHandler();
    const event = {
      id: 'test-id',
      type: 'user.password_changed',
      source: 'test',
      data: { userId: 'user-1', email: 'test@example.com' },
      timestamp: new Date(),
    };

    await handler.handle(event);
  });

  it('should handle task created event', async () => {
    const handler = new TaskCreatedHandler();
    const event = {
      id: 'test-id',
      type: 'task.created',
      source: 'test',
      data: { taskId: 'task-1', userId: 'user-1', title: 'Test Task' },
      timestamp: new Date(),
    };

    await handler.handle(event);
  });

  it('should handle task completed event', async () => {
    const handler = new TaskCompletedHandler();
    const event = {
      id: 'test-id',
      type: 'task.completed',
      source: 'test',
      data: { taskId: 'task-1', userId: 'user-1', completedAt: new Date() },
      timestamp: new Date(),
    };

    await handler.handle(event);
  });
});

describe('EventBus Integration', () => {
  it('should publish and handle events', async () => {
    const eventBus = new EventBus();
    const handler = { handle: vi.fn() };

    eventBus.subscribe('test.event', handler);
    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(handler.handle).toHaveBeenCalled();
  });

  it('should emit events', async () => {
    const eventBus = new EventBus();
    const emittedEvents: any[] = [];

    eventBus.on('eventPublished', (event) => {
      emittedEvents.push(event);
    });

    await eventBus.publish('test.event', { data: 'test' }, 'test');

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].type).toBe('test.event');
  });
});
