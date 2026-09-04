import { ApiResponse, ApiError } from '../types/api.js';

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | boolean>;
}

export class ApiClient {
  private config: ApiClientConfig;
  private accessToken: string | null = null;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      ...config,
    };
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private getHeaders(): Record<string, string> {
    const headers = { ...this.config.headers };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(path, this.config.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', headers = {}, body, params } = options;
    const url = this.buildUrl(path, params);
    const allHeaders = { ...this.getHeaders(), ...headers };
    try {
      const response = await fetch(url, {
        method,
        headers: allHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.timeout!),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.message || response.statusText,
            details: errorData,
          },
          timestamp: new Date().toISOString(),
        };
      }
      const data = await response.json();
      return {
        success: true,
        data: data.data,
        meta: data.meta,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'GET', params });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'POST', body });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
