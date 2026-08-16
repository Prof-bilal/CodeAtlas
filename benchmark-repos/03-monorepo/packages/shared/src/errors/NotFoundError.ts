import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  public readonly resource: string;
  public readonly resourceId?: string;

  constructor(resource: string, resourceId?: string) {
    const message = resourceId
      ? `${resource} with id '${resourceId}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      resource: this.resource,
      resourceId: this.resourceId,
    };
  }

  static user(id: string): NotFoundError {
    return new NotFoundError('User', id);
  }

  static project(id: string): NotFoundError {
    return new NotFoundError('Project', id);
  }

  static task(id: string): NotFoundError {
    return new NotFoundError('Task', id);
  }

  static payment(id: string): NotFoundError {
    return new NotFoundError('Payment', id);
  }

  static subscription(id: string): NotFoundError {
    return new NotFoundError('Subscription', id);
  }

  static notification(id: string): NotFoundError {
    return new NotFoundError('Notification', id);
  }

  static comment(id: string): NotFoundError {
    return new NotFoundError('Comment', id);
  }

  static file(id: string): NotFoundError {
    return new NotFoundError('File', id);
  }

  static route(path: string): NotFoundError {
    return new NotFoundError('Route', path);
  }

  static resource(resource: string, id: string): NotFoundError {
    return new NotFoundError(resource, id);
  }
}
