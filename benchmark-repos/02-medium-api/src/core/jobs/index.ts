import { processQueue, addJob, closeQueues, JobData } from './jobQueue.js';
import { getProcessor } from './processors.js';

const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  AUDIT: 'audit',
  TASKS: 'tasks',
  MAINTENANCE: 'maintenance',
  REPORTS: 'reports',
} as const;

export async function initializeWorkers(): Promise<void> {
  const queues = Object.values(QUEUE_NAMES);
  
  for (const queueName of queues) {
    await processQueue(queueName, async (job) => {
      const processor = getProcessor(job.data.type);
      
      if (!processor) {
        throw new Error(`No processor found for job type: ${job.data.type}`);
      }
      
      return processor(job);
    });
    
    console.log(`Worker initialized for queue: ${queueName}`);
  }
}

export async function shutdownWorkers(): Promise<void> {
  await closeQueues();
  console.log('All workers shut down');
}

export { QUEUE_NAMES, addJob };

export async function sendEmailJob(to: string, subject: string, html: string): Promise<void> {
  await addJob(QUEUE_NAMES.EMAIL, {
    type: 'send-email',
    payload: { to, subject, html },
  });
}

export async function sendNotificationJob(
  userId: string,
  type: 'email' | 'push' | 'in_app',
  category: 'system' | 'payment' | 'task' | 'security' | 'marketing',
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<void> {
  await addJob(QUEUE_NAMES.NOTIFICATIONS, {
    type: 'send-notification',
    payload: { userId, type, category, title, message, data },
  });
}

export async function processPaymentJob(
  userId: string,
  amount: number,
  currency?: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await addJob(QUEUE_NAMES.PAYMENTS, {
    type: 'process-payment',
    payload: { userId, amount, currency, description, metadata },
  });
}

export async function auditLogJob(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  changes?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await addJob(QUEUE_NAMES.AUDIT, {
    type: 'audit-log',
    payload: { userId, action, resource, resourceId, changes, ipAddress, userAgent },
  });
}

export async function sendTaskReminderJob(
  userId: string,
  taskId: string,
  taskTitle: string,
  dueDate: Date,
  priority: string
): Promise<void> {
  await addJob(QUEUE_NAMES.TASKS, {
    type: 'send-task-reminder',
    payload: { userId, taskId, taskTitle, dueDate, priority },
  });
}

export async function scheduleCleanup(): Promise<void> {
  await addJob(QUEUE_NAMES.MAINTENANCE, {
    type: 'cleanup-expired-sessions',
    payload: {},
  }, { repeat: { cron: '0 */6 * * *' } });
}
