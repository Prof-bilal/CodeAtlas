import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VerifyCommandConfig, VerifyConfig } from "@atlas/core";

const CONFIG_FILENAME = "verify.json";

export class VerifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyConfigError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isVerifyCommandConfig(v: unknown): v is VerifyCommandConfig {
  if (!isRecord(v)) return false;
  if (typeof v["command"] !== "string") return false;
  if (!Array.isArray(v["args"])) return false;
  if (!(v["args"] as unknown[]).every((a: unknown) => typeof a === "string")) return false;
  if (v["timeoutMs"] !== undefined && typeof v["timeoutMs"] !== "number") return false;
  return true;
}

function validateConfig(raw: unknown): VerifyConfig {
  if (!isRecord(raw)) {
    throw new VerifyConfigError("Config must be a JSON object");
  }

  if (raw["enabled"] !== undefined && typeof raw["enabled"] !== "boolean") {
    throw new VerifyConfigError("'enabled' must be a boolean");
  }

  const enabled = (raw["enabled"] as boolean) ?? true;

  if (raw["commands"] !== undefined) {
    if (!isRecord(raw["commands"])) {
      throw new VerifyConfigError("'commands' must be an object");
    }

    for (const [key, value] of Object.entries(raw["commands"])) {
      if (!isVerifyCommandConfig(value)) {
        throw new VerifyConfigError(
          `Command "${key}" has invalid config: must have "command" (string), "args" (string[]), optional "timeoutMs" (number)`,
        );
      }
    }
  }

  const commands: Record<string, VerifyCommandConfig> = isRecord(raw["commands"])
    ? Object.fromEntries(
        Object.entries(raw["commands"]).filter(([, v]) => isVerifyCommandConfig(v)) as [
          string,
          VerifyCommandConfig,
        ][],
      )
    : {};

  return { enabled, commands };
}

export function loadVerifyConfig(cwd: string): VerifyConfig | undefined {
  const configPath = resolve(cwd, ".codeatlas", CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return validateConfig(raw);
  } catch (err) {
    if (err instanceof VerifyConfigError) {
      throw err;
    }
    throw new VerifyConfigError(
      `Failed to parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
