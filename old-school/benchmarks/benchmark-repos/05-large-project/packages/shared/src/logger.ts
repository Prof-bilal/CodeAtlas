export enum LogLevel { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3, FATAL = 4 }
export interface LogEntry { level: LogLevel; message: string; timestamp: Date; context: string; metadata?: Record<string, unknown>; error?: Error; }
export interface LoggerConfig { level: LogLevel; context: string; transports: LogTransport[]; redactFields: string[]; }
export interface LogTransport { name: string; level: LogLevel; write(entry: LogEntry): Promise<void>; }
export class Logger {
  private config: LoggerConfig;
  constructor(config: Partial<LoggerConfig> & { context: string }) {
    this.config = { level: config.level ?? LogLevel.INFO, context: config.context, transports: config.transports ?? [], redactFields: config.redactFields ?? ['password','token','secret'] };
  }
  child(context: string): Logger { return new Logger({ ...this.config, context: this.config.context + ':' + context }); }
  debug(msg: string, meta?: Record<string, unknown>) { this.log(LogLevel.DEBUG, msg, meta); }
  info(msg: string, meta?: Record<string, unknown>) { this.log(LogLevel.INFO, msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>) { this.log(LogLevel.WARN, msg, meta); }
  error(msg: string, err?: Error, meta?: Record<string, unknown>) { this.log(LogLevel.ERROR, msg, meta, err); }
  fatal(msg: string, err?: Error, meta?: Record<string, unknown>) { this.log(LogLevel.FATAL, msg, meta, err); }
  private async log(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error): Promise<void> {
    if (level < this.config.level) return;
    for (const t of this.config.transports) { if (level >= t.level) { try { await t.write({ level, message, timestamp: new Date(), context: this.config.context, metadata, error }); } catch {} } }
  }
}