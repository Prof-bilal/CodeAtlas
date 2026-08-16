import { Request, Response, NextFunction } from 'express';
import { userRepository } from '../../../repositories/userRepository.js';

export function resourceGuard(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const resourceId = req.params.id;
    
    if (!resourceId) {
      next();
      return;
    }

    const hasAccess = await checkResourceAccess(
      req.user.id,
      req.user.role,
      resourceType,
      resourceId
    );

    if (!hasAccess) {
      res.status(403).json({ 
        error: 'Access denied to resource',
        resource: resourceType,
        resourceId,
      });
      return;
    }

    next();
  };
}

async function checkResourceAccess(
  userId: string,
  userRole: string,
  resourceType: string,
  resourceId: string
): Promise<boolean> {
  if (userRole === 'superadmin') {
    return true;
  }

  switch (resourceType) {
    case 'task':
      return await checkTaskAccess(userId, resourceId);
    case 'payment':
      return await checkPaymentAccess(userId, resourceId);
    case 'notification':
      return await checkNotificationAccess(userId, resourceId);
    case 'api_key':
      return await checkApiKeyAccess(userId, resourceId);
    case 'user':
      return userId === resourceId || userRole === 'admin';
    default:
      return false;
  }
}

async function checkTaskAccess(userId: string, taskId: string): Promise<boolean> {
  const { taskRepository } = await import('../../../repositories/taskRepository.js');
  const task = await taskRepository.findById(taskId);
  
  if (!task) {
    return false;
  }

  return task.userId === userId || task.assignedTo === userId;
}

async function checkPaymentAccess(userId: string, paymentId: string): Promise<boolean> {
  const { paymentRepository } = await import('../../../repositories/paymentRepository.js');
  const payment = await paymentRepository.findById(paymentId);
  
  if (!payment) {
    return false;
  }

  return payment.userId === userId;
}

async function checkNotificationAccess(userId: string, notificationId: string): Promise<boolean> {
  const { notificationRepository } = await import('../../../repositories/notificationRepository.js');
  const notification = await notificationRepository.findById(notificationId);
  
  if (!notification) {
    return false;
  }

  return notification.userId === userId;
}

async function checkApiKeyAccess(userId: string, apiKeyId: string): Promise<boolean> {
  const { apiKeyRepository } = await import('../../../repositories/apiKeyRepository.js');
  const apiKey = await apiKeyRepository.findById(apiKeyId);
  
  if (!apiKey) {
    return false;
  }

  return apiKey.userId === userId;
}
