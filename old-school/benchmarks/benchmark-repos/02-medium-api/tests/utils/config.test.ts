import { describe, it, expect } from 'vitest';
import { Config, getConfig, validateConfig } from '../../src/utils/config.js';

describe('Config', () => {
  it('should have default config', () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.port).toBeDefined();
  });

  it('should validate config', () => {
    const validConfig: Partial<Config> = {
      port: 3000,
      host: 'localhost',
      nodeEnv: 'development',
    };
    const result = validateConfig(validConfig);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid config', () => {
    const invalidConfig = {
      port: -1,
    };
    const result = validateConfig(invalidConfig);
    expect(result.valid).toBe(false);
  });
});
