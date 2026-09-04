import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../notifications/emailService.js';

export class TaskCreatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId, userId, title } = event.data;
    logger.info(`Task created: ${taskId} by user ${userId}`);
  }
}

export class TaskUpdatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId, changes } = event.data;
    logger.info(`Task updated: ${taskId}`, changes);
  }
}

export class TaskCompletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId, userId, completedAt } = event.data;
    logger.info(`Task completed: ${taskId} by user ${userId}`);
  }
}

export class TaskDeletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId } = event.data;
    logger.info(`Task deleted: ${taskId}`);
  }
}

export class TaskAssignedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId, assigneeId, assignerId } = event.data;
    logger.info(`Task ${taskId} assigned to user ${assigneeId} by ${assignerId}`);
  }
}

export class TaskCommentAddedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { taskId, commentId, userId, content } = event.data;
    logger.info(`Comment added to task ${taskId} by user ${userId}`);
  }
}
