import { AuthController, createAuthController } from './controllers/authController.js';
import { TaskController, createTaskController } from './controllers/taskController.js';
import { ProjectController, createProjectController } from './controllers/projectController.js';
import { AuthMiddleware, createAuthMiddleware, extractTokenFromHeader } from './middleware/auth.js';
import { ErrorHandler, createErrorHandler } from './middleware/errorHandler.js';
import { RateLimiter } from './middleware/rateLimiter.js';

export interface ApiConfig {
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

class ApiServer {
  private config: ApiConfig;
  private authController: AuthController;
  private taskController: TaskController;
  private projectController: ProjectController;
  private authMiddleware: AuthMiddleware;
  private errorHandler: ErrorHandler;
  private rateLimiter: RateLimiter;
  private isRunning = false;

  constructor(config: ApiConfig) {
    this.config = config;
    this.authController = createAuthController({ jwtSecret: config.jwtSecret, bcryptRounds: 12 });
    this.taskController = createTaskController();
    this.projectController = createProjectController();
    this.authMiddleware = createAuthMiddleware({
      jwtSecret: config.jwtSecret,
      excludePaths: ['/health', '/auth/login', '/auth/register'],
    });
    this.errorHandler = createErrorHandler();
    this.rateLimiter = RateLimiter.create({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`API server started on port ${this.config.port}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.rateLimiter.destroy();
    console.log('API server stopped');
  }

  getHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  getAuthController(): AuthController { return this.authController; }
  getTaskController(): TaskController { return this.taskController; }
  getProjectController(): ProjectController { return this.projectController; }
}

export function createApiServer(config: ApiConfig): ApiServer {
  return new ApiServer(config);
}

export { AuthController } from './controllers/authController.js';
export { TaskController } from './controllers/taskController.js';
export { ProjectController } from './controllers/projectController.js';
export { AuthMiddleware } from './middleware/auth.js';
export { ErrorHandler } from './middleware/errorHandler.js';
export { RateLimiter } from './middleware/rateLimiter.js';
