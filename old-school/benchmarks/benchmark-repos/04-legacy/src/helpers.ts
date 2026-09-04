// Helper functions - mixed bag
// Most of these are unused but we're not sure which ones

import { Request } from 'express';
import * as crypto from 'crypto';

// IP address utilities
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// User agent parsing
export function parseUserAgent(ua: string | undefined): {
  browser: string;
  os: string;
  device: string;
} {
  if (!ua) return { browser: 'unknown', os: 'unknown', device: 'unknown' };

  // Simple detection
  let browser = 'unknown';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  let os = 'unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';

  let device = 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) device = 'mobile';
  else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'tablet';

  return { browser, os, device };
}

// Rate limiting helpers
export function createRateLimitKey(identifier: string, window: string): string {
  return `ratelimit:${identifier}:${window}`;
}

// Response helpers
export function successResponse(data: any, message?: string) {
  return {
    success: true,
    data,
    message: message || 'ok',
  };
}

export function errorResponse(error: string, code?: string) {
  return {
    success: false,
    error,
    code: code || 'ERROR',
  };
}

// Pagination
export function paginate(
  page: number,
  limit: number
): { offset: number; limit: number } {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  return { offset: (p - 1) * l, limit: l };
}

export function paginationMeta(
  total: number,
  page: number,
  limit: number
) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

// Deep clone (simplified)
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Debounce
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Retry
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}

// Sleep
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
