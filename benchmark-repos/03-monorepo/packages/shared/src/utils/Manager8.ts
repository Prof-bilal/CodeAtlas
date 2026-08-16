export interface Config8 {
  name: string;
  version: string;
  settings: Record<string, unknown>;
  features: string[];
}

export class Manager8 {
  private config: Config8;
  private state: Map<string, unknown> = new Map();
  private listeners: Array<(event: string, data: unknown) => void> = [];

  constructor(config: Config8) {
    this.config = config;
    this.state.set('initialized', true);
    this.state.set('startTime', new Date());
  }

  get<K extends string>(key: K): unknown {
    return this.state.get(key);
  }

  set(key: string, value: unknown): void {
    this.state.set(key, value);
    this.emit('state:change', { key, value });
  }

  has(key: string): boolean {
    return this.state.has(key);
  }

  delete(key: string): boolean {
    return this.state.delete(key);
  }

  clear(): void {
    this.state.clear();
  }

  on(listener: (event: string, data: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  emit(event: string, data: unknown): void {
    this.listeners.forEach(listener => listener(event, data));
  }

  getConfig(): Config8 {
    return { ...this.config };
  }

  getState(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }

  getStats(): { stateSize: number; listenerCount: number; uptime: number } {
    const startTime = this.state.get('startTime') as Date;
    return {
      stateSize: this.state.size,
      listenerCount: this.listeners.length,
      uptime: startTime ? Date.now() - startTime.getTime() : 0,
    };
  }

  reset(): void {
    this.state.clear();
    this.state.set('initialized', true);
    this.state.set('startTime', new Date());
  }

  destroy(): void {
    this.listeners = [];
    this.state.clear();
  }
}

export function createManager8(config: Config8): Manager8 {
  return new Manager8(config);
}

export function getDefaultConfig8(): Config8 {
  return {
    name: 'Manager8',
    version: '1.0.0',
    settings: {},
    features: [],
  };
}
