import { ApiClient } from './services/apiClient.js';
import { AuthService } from './services/authService.js';
import { TaskService } from './services/taskService.js';
import { ProjectService } from './services/projectService.js';
import { createAuthStore } from './store/authStore.js';
import { createTaskStore } from './store/taskStore.js';

export interface AppConfig {
  apiUrl: string;
  environment: 'development' | 'staging' | 'production';
}

export class App {
  private apiClient: ApiClient;
  private authService: AuthService;
  private taskService: TaskService;
  private projectService: ProjectService;
  private authStore: ReturnType<typeof createAuthStore>;
  private taskStore: ReturnType<typeof createTaskStore>;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.apiClient = new ApiClient({ baseUrl: config.apiUrl });
    this.authService = new AuthService(this.apiClient);
    this.taskService = new TaskService(this.apiClient);
    this.projectService = new ProjectService(this.apiClient);
    this.authStore = createAuthStore();
    this.taskStore = createTaskStore();
  }

  async initialize(): Promise<void> {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await this.authService.refreshToken();
        const user = this.authService.getCurrentUser();
        if (user) {
          this.authStore.login(user);
        }
      }
    } catch {
      localStorage.removeItem('refreshToken');
    }
  }

  getApiClient(): ApiClient { return this.apiClient; }
  getAuthService(): AuthService { return this.authService; }
  getTaskService(): TaskService { return this.taskService; }
  getProjectService(): ProjectService { return this.projectService; }
  getAuthStore() { return this.authStore; }
  getTaskStore() { return this.taskStore; }
  getConfig(): AppConfig { return this.config; }
  isDevelopment(): boolean { return this.config.environment === 'development'; }
}

export function createApp(config: AppConfig): App {
  return new App(config);
}
