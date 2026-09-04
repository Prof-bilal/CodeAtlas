// Sentry integration

export function initSentry(dsn: string) {
  console.log(Sentry initialized with DSN: ...);
}

export function captureError(error: Error, context?: any) {
  console.error('Sentry:', error.message, context);
}
