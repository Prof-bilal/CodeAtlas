import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/events/eventBus.js';
import { UserRegisteredHandler, TaskCreatedHandler } from '../src/events/handlers/userHandlers.js';

describe('User Event Handlers', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should handle user registration', async () => {
    const handler = new UserRegisteredHandler();
    const event = {
      id: 'test-id',
      type: 'user.registered',
      source: 'test',
      data: { userId: 'user-1', email: 'test@example.com', name: 'Test User' },
      timestamp: new Date(),
    };

    await handler.handle(event);
    // Just verify no error is thrown
  });

  it('should handle task creation', async () => {
    const handler = new TaskCreatedHandler();
    const event = {
      id: 'test-id',
      type: 'task.created',
      source: 'test',
      data: { taskId: 'task-1', userId: 'user-1', title: 'Test Task' },
      timestamp: new Date(),
    };

    await handler.handle(event);
    // Just verify no error is thrown
  });
});
