import { createInterface } from "node:readline/promises";
import {
  type OllamaConnectResult,
  type OllamaStatus,
  type ProviderOverview,
  type ProviderStatus,
  createOllamaService,
} from "@atlas/sdk";
import type { Command } from "commander";

function providerGlyph(configured: boolean): string {
  return configured ? "✓" : "○";
}

/** Build the Ollama service; `ATLAS_PROVIDERS_CONFIG` overrides the user file (tests, CI). */
function ollamaService() {
  const configPath = process.env["ATLAS_PROVIDERS_CONFIG"];
  return createOllamaService(configPath === undefined ? {} : { configPath });
}

/** Render one provider row for `atlas providers`. */
export function renderProviderStatus(status: ProviderStatus): string {
  if (!status.configured) {
    return `${providerGlyph(false)} ${status.name}  not configured`;
  }
  const key = status.hasApiKey ? "" : status.name === "ollama" ? "" : " (missing key)";
  return `${providerGlyph(true)} ${status.name}  ${status.model ?? "no model"}${key}`;
}

/** Render the full `/providers` overview. */
export function renderProviderOverview(overview: ProviderOverview): string {
  const lines = ["AI PROVIDERS", ...overview.providers.map(renderProviderStatus)];
  lines.push("", `Default provider: ${overview.defaultProvider}`);
  lines.push(`Default model: ${overview.defaultModel ?? "none"}`);
  return lines.join("\n");
}

/** Render `/ollama status`. */
export function renderOllamaStatus(status: OllamaStatus): string {
  const lines = [
    "OLLAMA",
    status.connected ? "✓ Connected" : "○ Not connected",
    `Mode: ${status.mode}`,
    `Base URL: ${status.baseUrl}`,
    `API key: ${status.hasApiKey ? status.keyDisplay : "not set"}`,
    `Model: ${status.model ?? "none selected"}`,
  ];
  return lines.join("\n");
}

/** Render `/ollama connect` output. */
export function renderOllamaConnect(result: OllamaConnectResult): string {
  return [
    "OLLAMA",
    "✓ Connected",
    `Mode: ${result.status.mode}`,
    `API key: ${result.status.hasApiKey ? result.status.keyDisplay : "local (no key)"}`,
    "Models:",
    ...result.models.map((model) => `  ✓ ${model}`),
  ].join("\n");
}

/** Render the model list. */
export function renderOllamaModels(models: readonly string[]): string {
  if (models.length === 0) {
    return "No models returned by the Ollama server.";
  }
  return ["Ollama Models", ...models.map((model) => `  ✓ ${model}`)].join("\n");
}

export function registerProviders(program: Command): void {
  program
    .command("providers")
    .description("Show the status of all AI providers (Ollama, OpenAI, …)")
    .option("--json", "print results as JSON")
    .action(async (options: { json?: boolean }) => {
      const service = ollamaService();
      const overview = service.overview();
      if (options.json === true) {
        console.log(JSON.stringify(overview, null, 2));
        return;
      }
      console.log(renderProviderOverview(overview));
    });
}

interface OllamaOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly saveKey?: boolean;
  readonly json?: boolean;
}

export function registerOllama(program: Command): void {
  const ollama = program
    .command("ollama")
    .description("Connect, inspect, and manage the optional Ollama AI provider");

  ollama
    .command("status")
    .description("Show the Ollama connection status")
    .option("--json", "print results as JSON")
    .action(async (options: { json?: boolean }) => {
      const service = ollamaService();
      const status = service.status();
      if (options.json === true) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      console.log(renderOllamaStatus(status));
    });

  ollama
    .command("connect")
    .description("Test and save the Ollama connection (local server or cloud key)")
    .option("--api-key <key>", "Ollama API key (Ollama Cloud); omit for a local server")
    .option("--base-url <url>", "Ollama base URL (default http://localhost:11434)")
    .option("--save-key", "persist the API key in ~/.codeatlas/providers.json (0600)")
    .option("--json", "print results as JSON")
    .action(async (options: OllamaOptions) => {
      await runConnect(options);
    });

  ollama
    .command("disconnect")
    .description("Clear the saved Ollama connection (env keys are kept)")
    .action(async () => {
      const service = ollamaService();
      service.disconnect();
      console.log("Ollama disconnected.");
    });

  ollama
    .command("models")
    .description("List models exposed by the Ollama server")
    .option("--json", "print results as JSON")
    .action(async (options: { json?: boolean }) => {
      const service = ollamaService();
      const result = await service.listModels();
      if (!result.ok) {
        console.error(`Failed to list models: ${result.error.message}`);
        process.exitCode = 1;
        return;
      }
      if (options.json === true) {
        console.log(JSON.stringify({ models: result.value }, null, 2));
        return;
      }
      console.log(renderOllamaModels(result.value));
    });

  ollama
    .command("use <model>")
    .description("Select the active Ollama model for context summarization")
    .action(async (model: string) => {
      const service = ollamaService();
      const status = service.use(model);
      console.log(renderOllamaStatus(status));
    });

  // Bare `atlas ollama` prints the status.
  ollama.action(async () => {
    const service = ollamaService();
    console.log(renderOllamaStatus(service.status()));
  });
}

async function runConnect(options: OllamaOptions): Promise<void> {
  const service = ollamaService();
  let apiKey = options.apiKey;
  if (apiKey === undefined && process.stdin.isTTY) {
    const answer = await promptSecret("Ollama API key (leave empty for a local server): ");
    apiKey = answer;
  }
  const result = await service.connect({
    ...(apiKey !== undefined && apiKey !== "" ? { apiKey } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    saveKey: options.saveKey === true,
  });
  if (!result.ok) {
    console.error(`Connection failed: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (options.json === true) {
    console.log(JSON.stringify(result.value, null, 2));
    return;
  }
  console.log(renderOllamaConnect(result.value));
}

/** Prompt for a secret without echoing it back to the terminal. */
async function promptSecret(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    return answer.trim();
  } finally {
    rl.close();
  }
}
