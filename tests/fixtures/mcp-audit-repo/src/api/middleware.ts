export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  body?: T;
}

export function errorHandler(error: unknown): ApiResponse<{ error: string }> {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, status: 500, body: { error: message } };
}

export function rateLimit(maxRequests: number, seen: number): ApiResponse<void> {
  if (seen > maxRequests) {
    return { ok: false, status: 429 };
  }
  return { ok: true, status: 200 };
}

export function notFound(): ApiResponse<{ error: string }> {
  return { ok: false, status: 404, body: { error: "not found" } };
}