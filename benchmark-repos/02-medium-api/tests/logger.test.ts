import { describe, it, expect } from 'vitest';
import { Logger } from '../src/utils/logger.js';

describe('Logger', () => {
  it('should create logger instance', () => {
    const logger = new Logger('test');
    expect(logger).toBeDefined();
  });

  it('should have log methods', () => {
    const logger = new Logger('test');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
