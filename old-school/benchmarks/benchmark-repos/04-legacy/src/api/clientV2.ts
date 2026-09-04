// API v2 client
// Current version

interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = { timeout: 5000, ...config };
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(${this.config.baseUrl}, {
      headers: this.getHeaders(),
    });
    return response.json();
  }

  async post<T>(path: string, body: any): Promise<T> {
    const response = await fetch(${this.config.baseUrl}, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return response.json();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers['Authorization'] = Bearer ;
    return headers;
  }
}
