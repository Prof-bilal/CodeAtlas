import { Logger, Result, Ok, Err } from '@atlas/shared';

const logger = new Logger({ context: 'UserqueueService' });

export interface ServiceConfig12 {
  baseUrl: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

export class UserQueueService12 {
  private config: ServiceConfig12;
  private abortController?: AbortController;

  constructor(config?: Partial<ServiceConfig12>) {
    this.config = {
      baseUrl: process.env.API_URL ?? 'http://localhost:3000',
      timeout: 30000,
      retries: 3,
      headers: { 'Content-Type': 'application/json' },
      ...config,
    };
  }

  async get<T>(path: string): Promise<Result<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<Result<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<Result<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<Result<T>> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), this.config.timeout);
    try {
      const response = await fetch(this.config.baseUrl + path, {
        method,
        headers: this.config.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: this.abortController.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) return Err(new Error('HTTP ' + response.status));
      const data = await response.json() as T;
      return Ok(data);
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error('Request failed', error as Error);
      return Err(error as Error);
    }
  }

  cancel(): void { this.abortController?.abort(); }
  getConfig(): ServiceConfig12 { return { ...this.config }; }
}