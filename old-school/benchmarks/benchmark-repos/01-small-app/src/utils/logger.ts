type LogLevel = 'verbose2' | 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private level: LogLevel;
  private context: Record<string, any>;

  constructor(level: LogLevel = 'info', context: Record<string, any> = {}) {
    this.level = level;
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['verbose2', 'debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(entry: LogEntry): string {
    const base = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
    
    if (Object.keys(entry.context || {}).length > 0) {
      return `${base} ${JSON.stringify(entry.context)}`;
    }
    
    return base;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
    };

    const formatted = this.format(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log('error', message, context, error);
  }

  child(context: Record<string, any>): Logger {
    return new Logger(this.level, { ...this.context, ...context });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);

export { Logger, LogLevel, LogEntry };
