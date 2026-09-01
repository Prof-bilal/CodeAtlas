/**
 * Minimal stderr logger for the MCP server.
 *
 * MCP over stdio uses **stdout** for protocol messages, so application logs
 * must never be written there — every log line goes to stderr.
 */

export type LogLevel = "verbose2" | "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  verbose2: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVELS: readonly LogLevel[] = ["verbose2", "debug", "info", "warn", "error"];

/** Environment variable controlling the default log level. */
const LOG_LEVEL_ENV = "ATLAS_MCP_LOG_LEVEL";

export interface Logger {
  verbose2(message: string): void;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface LoggerOptions {
  /** Minimum level to emit (default: `ATLAS_MCP_LOG_LEVEL` env, else `"info"`). */
  readonly level?: LogLevel;
  /** Output stream (default: `process.stderr`). */
  readonly stream?: NodeJS.WritableStream;
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && (LEVELS as readonly string[]).includes(value);
}

/** Create a logger that writes `[atlas-mcp] <level> <message>` lines to stderr. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const envLevel = process.env[LOG_LEVEL_ENV];
  const threshold = LEVEL_ORDER[options.level ?? (isLogLevel(envLevel) ? envLevel : "info")];
  const stream = options.stream ?? process.stderr;

  const write = (level: LogLevel, message: string): void => {
    if (LEVEL_ORDER[level] >= threshold) {
      stream.write(`[atlas-mcp] ${level} ${message}\n`);
    }
  };

  return {
    verbose2: (message) => write("verbose2", message),
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message, error) => {
      write("error", message);
      if (error !== undefined) {
        stream.write(`  ${formatError(error)}\n`);
      }
    },
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
