export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  prefix?: string;
  outputs: LogOutput[];
}

export interface LogOutput {
  write: (entry: LogEntry) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level || 'info',
      format: config.format || 'json',
      prefix: config.prefix || '',
      outputs: config.outputs || [{ write: (entry) => console.log(this.formatEntry(entry)) }],
    };
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;
    const entry: LogEntry = {
      level,
      message: this.config.prefix ? `${this.config.prefix}: ${message}` : message,
      timestamp: new Date(),
      context,
      error,
    };
    this.logs.push(entry);
    for (const output of this.config.outputs) {
      output.write(entry);
    }
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify({
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp.toISOString(),
        context: entry.context,
        error: entry.error?.message,
      });
    }
    return `[${entry.timestamp.toISOString()}] ${entry.level.toUpperCase()}: ${entry.message}`;
  }

  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}.${prefix}` : prefix,
    });
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) return this.logs.filter(l => l.level === level);
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

export function createConsoleLogger(level: LogLevel = 'info'): Logger {
  return new Logger({ level, outputs: [{ write: (entry) => console.log(`[${entry.level.toUpperCase()}] ${entry.message}`) }] });
}

export function createFileLogger(filePath: string, level: LogLevel = 'info'): Logger {
  return new Logger({
    level,
    outputs: [{
      write: (entry) => {
        // In real implementation, would write to file
      },
    }],
  });
}
