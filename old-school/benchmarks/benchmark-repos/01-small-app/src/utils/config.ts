export interface Config {
  [key: string]: any;
}

export class ConfigManager {
  private config: Config = {};
  private defaults: Config = {};
  private overrides: Config = {};

  constructor(defaults: Config = {}) {
    this.defaults = defaults;
    this.config = { ...defaults };
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const value = this.overrides[key] ?? this.config[key] ?? this.defaults[key] ?? defaultValue;
    return value as T;
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  setOverride(key: string, value: any): void {
    this.overrides[key] = value;
  }

  has(key: string): boolean {
    return key in this.overrides || key in this.config || key in this.defaults;
  }

  delete(key: string): void {
    delete this.config[key];
    delete this.overrides[key];
  }

  getAll(): Config {
    return {
      ...this.defaults,
      ...this.config,
      ...this.overrides,
    };
  }

  getKeys(): string[] {
    const allKeys = new Set([
      ...Object.keys(this.defaults),
      ...Object.keys(this.config),
      ...Object.keys(this.overrides),
    ]);
    
    return Array.from(allKeys);
  }

  reset(): void {
    this.config = { ...this.defaults };
    this.overrides = {};
  }

  loadFromEnv(prefix: string = 'APP_'): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key.slice(prefix.length).toLowerCase();
        this.set(configKey, value);
      }
    }
  }

  loadFromObject(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      this.set(key, value);
    }
  }
}

export const configManager = new ConfigManager();
