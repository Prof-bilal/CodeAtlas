// Error handler middleware
// OLD version - uses callbacks

export function errorHandler(err: any, req: any, res: any, next: any) {
  console.error('Error:', err.message);

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    // TODO: add error codes in v3,
  });
}
