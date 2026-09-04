import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../../src/utils/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
  });

  it('should create logger with context', () => {
    expect(logger).toBeDefined();
  });

  it('should log info messages', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message');
    // Logger should not throw
    spy.mockRestore();
  });

  it('should log error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('error message');
    spy.mockRestore();
  });

  it('should log warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warn message');
    spy.mockRestore();
  });

  it('should log debug messages', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('debug message');
    spy.mockRestore();
  });
});
