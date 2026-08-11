import type { HttpTransport, HttpResponse } from "../src/transport";

export interface TransportCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/**
 * A scriptable fake transport that replays canned responses and records every
 * call, so tests can assert the request shape without a network.
 */
export function createFakeTransport(responses: readonly HttpResponse[]): {
  transport: HttpTransport;
  calls: TransportCall[];
} {
  const calls: TransportCall[] = [];
  let index = 0;
  return {
    transport: {
      async post(url, headers, body) {
        calls.push({ url, headers, body });
        const response = responses[Math.min(index, responses.length - 1)] ?? {
          status: 200,
          json: {},
        };
        index += 1;
        return response;
      },
    },
    calls,
  };
}
