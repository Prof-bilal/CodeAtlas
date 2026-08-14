/** A raw HTTP response: status plus the parsed (or raw) body. */
export interface HttpResponse {
  readonly status: number;
  /** Parsed JSON body when the response was JSON; otherwise the raw text. */
  readonly json: unknown;
}

/** Minimal HTTP contract, injectable so adapters can be tested offline. */
export interface HttpTransport {
  post(url: string, headers: Record<string, string>, body: unknown): Promise<HttpResponse>;
  /** GET request (used by providers that expose a model catalog, e.g. Ollama). */
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

/**
 * The default transport backed by Node's global `fetch`. Sends `body` as JSON;
 * parses the response body as JSON, falling back to the raw text.
 */
export const fetchTransport: HttpTransport = {
  async post(url, headers, body) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return toResponse(response);
  },
  async get(url, headers = {}) {
    const response = await fetch(url, { method: "GET", headers });
    return toResponse(response);
  },
};

async function toResponse(response: globalThis.Response): Promise<HttpResponse> {
  const text = await response.text();
  let json: unknown = text;
  if (text !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: response.status, json };
}
