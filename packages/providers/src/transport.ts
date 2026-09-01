/** A raw HTTP response: status plus the parsed (or raw) body. */
export interface HttpResponse {
  readonly status: number;
  /** Parsed JSON body when the response was JSON; otherwise the raw text. */
  readonly json: unknown;
}

import type { TokenUsage, ToolCall } from "@atlas/core";

/** A chunk of a streaming response. */
export interface StreamChunk {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage | null;
  readonly done: boolean;
}

/** A metric name and value for Statsd transmission. */
export interface StatsdMetric {
  readonly name: string;
  readonly value: number | string;
  readonly type: "c" | "g" | "ms" | "s" | "h" | "msr";
  readonly tags?: readonly string[];
}

/** Minimal Statsd contract, injectable so services can be tested offline. */
export interface StatsdTransport {
  send(metric: StatsdMetric): Promise<void>;
}

/** Default Statsd transport backed by Node's `dgram` module, sending UDP datagrams. */
export const statsdTransport: StatsdTransport = {
  async send(metric) {
    const dgram = await import("node:dgram");
    const client = dgram.createSocket("udp4");
    const body = `${metric.name}:${metric.value}|${metric.type}`;
    client.send(body, 0, body.length, 8125, "localhost");
    client.close();
  },
};

/** Minimal HTTP contract, injectable so adapters can be tested offline. */
export interface HttpTransport {
  post(url: string, headers: Record<string, string>, body: unknown): Promise<HttpResponse>;
  /** GET request (used by providers that expose a model catalog, e.g. Ollama). */
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
  /** POST request with streaming response (NDJSON). */
  postStream(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<HttpResponse>;
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
  async postStream(url, headers, body, onChunk) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.body) {
      const final = await toResponse(response);
      return final;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed === "data: [DONE]") {
          continue;
        }
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const chunk = parseStreamChunk(data);
            onChunk(chunk);
            if (chunk.done) {
              break;
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
    return { status: response.status, json: {} };
  },
};

function parseStreamChunk(data: Record<string, unknown>): StreamChunk {
  const choices = data["choices"] as unknown[];
  if (!Array.isArray(choices) || choices.length === 0) {
    return { text: "", toolCalls: [], usage: null, done: false };
  }
  const choice = choices[0] as Record<string, unknown>;
  const delta = choice["delta"] as Record<string, unknown> | undefined;
  const finishReason = choice["finish_reason"] as string | undefined;
  const text = typeof delta?.["content"] === "string" ? delta["content"] : "";
  const toolCalls = delta?.["tool_calls"]
    ? parseDeltaToolCalls(delta["tool_calls"] as unknown[])
    : [];
  const usage = data["usage"] ? parseUsage(data["usage"] as Record<string, unknown>) : null;
  return {
    text,
    toolCalls,
    usage,
    done: finishReason !== undefined && finishReason !== null,
  };
}

function parseDeltaToolCalls(toolCalls: unknown[]): readonly ToolCall[] {
  return toolCalls
    .map((tc) => tc as Record<string, unknown>)
    .filter((tc): tc is Record<string, unknown> => {
      const type = tc["type"];
      const id = tc["id"];
      const fn = tc["function"] as Record<string, unknown> | undefined;
      return (
        type === "function" &&
        typeof id === "string" &&
        fn !== undefined &&
        typeof fn["name"] === "string"
      );
    })
    .map((tc) => {
      const fn = tc["function"] as Record<string, unknown>;
      return {
        id: tc["id"] as string,
        type: "function" as const,
        function: {
          name: fn["name"] as string,
          arguments:
            typeof fn["arguments"] === "string"
              ? fn["arguments"]
              : JSON.stringify(fn["arguments"] ?? {}),
        },
      };
    });
}

function parseUsage(usage: Record<string, unknown>): TokenUsage {
  return {
    inputTokens: typeof usage["prompt_tokens"] === "number" ? usage["prompt_tokens"] : 0,
    outputTokens: typeof usage["completion_tokens"] === "number" ? usage["completion_tokens"] : 0,
    totalTokens: typeof usage["total_tokens"] === "number" ? usage["total_tokens"] : 0,
  };
}

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
