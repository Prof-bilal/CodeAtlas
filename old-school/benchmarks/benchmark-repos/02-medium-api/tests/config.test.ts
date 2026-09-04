import { describe, it, expect } from 'vitest';
import { ConfigManager } from '../src/utils/config.js';

describe('ConfigManager', () => {
  it('should set and get values', () => {
    const config = new ConfigManager();
    config.set('key', 'value');
    expect(config.get('key')).toBe('value');
  });

  it('should use defaults', () => {
    const config = new ConfigManager({ defaultKey: 'defaultValue' });
    expect(config.get('defaultKey')).toBe('defaultValue');
  });

  it('should override values', () => {
    const config = new ConfigManager({ key: 'original' });
    config.setOverride('key', 'overridden');
    expect(config.get('key')).toBe('overridden');
  });

  it('should check if key exists', () => {
    const config = new ConfigManager();
    config.set('exists', true);
    
    expect(config.has('exists')).toBe(true);
    expect(config.has('notExists')).toBe(false);
  });
});
