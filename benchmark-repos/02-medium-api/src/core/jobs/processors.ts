import { Job } from 'bull';
import { JobData, JobResult } from './jobQueue.js';
import { notificationService } from '../notifications/notificationService.js';
import { paymentService } from '../payments/paymentService.js';
import { auditService } from '../audit/auditService.js';

export const processors: Record<string, (job: Job<JobData>) => Promise<JobResult>> = {
  'send-email': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    await notificationService.sendEmail(payload.to, payload.subject, payload.html);
    
    return { success: true };
  },

  'send-notification': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    await notificationService.sendNotification({
      userId: payload.userId,
      type: payload.type,
      category: payload.category,
      title: payload.title,
      message: payload.message,
      data: payload.data,
    });
    
    return { success: true };
  },

  'process-payment': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    const payment = await paymentService.createPaymentIntent({
      userId: payload.userId,
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      metadata: payload.metadata,
    });
    
    return { success: true, data: payment };
  },

  'audit-log': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    await auditService.log({
      userId: payload.userId,
      action: payload.action,
      resource: payload.resource,
      resourceId: payload.resourceId,
      changes: payload.changes,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
    });
    
    return { success: true };
  },

  'send-task-reminder': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    await notificationService.sendNotification({
      userId: payload.userId,
      type: 'in_app',
      category: 'task',
      title: 'Task Reminder',
      message: `Your task "${payload.taskTitle}" is due soon.`,
      data: {
        taskId: payload.taskId,
        dueDate: payload.dueDate,
        priority: payload.priority,
      },
    });
    
    return { success: true };
  },

  'cleanup-expired-sessions': async (job: Job<JobData>): Promise<JobResult> => {
    const { sessionRepository } = await import('../../repositories/sessionRepository.js');
    const deleted = await sessionRepository.deleteExpired();
    
    return { success: true, data: { deleted } };
  },

  'generate-report': async (job: Job<JobData>): Promise<JobResult> => {
    const { payload } = job.data;
    
    console.log(`Generating report for user ${payload.userId}`);
    
    return { success: true, data: { reportUrl: '/reports/123.pdf' } };
  },
};

export function getProcessor(type: string): ((job: Job<JobData>) => Promise<JobResult>) | undefined {
  return processors[type];
}
