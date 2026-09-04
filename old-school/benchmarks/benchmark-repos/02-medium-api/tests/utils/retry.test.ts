import { describe, it, expect } from 'vitest';
import { RetryUtil } from '../../src/utils/retry.js';

describe('RetryUtil', () => {
  it('should retry failed operations', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not yet');
      return 'success';
    };

    const result = await RetryUtil.withRetry(fn, { maxAttempts: 3, delay: 10 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should fail after max attempts', async () => {
    const fn = async () => {
      throw new Error('Always fails');
    };

    await expect(RetryUtil.withRetry(fn, { maxAttempts: 2, delay: 10 }))
      .rejects.toThrow('Always fails');
  });

  it('should support exponential backoff', async () => {
    const fn = async () => 'done';
    const result = await RetryUtil.withRetry(fn, {
      maxAttempts: 1,
      delay: 10,
      backoff: 'exponential',
    });
    expect(result).toBe('done');
  });
});
