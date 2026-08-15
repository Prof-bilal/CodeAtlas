export interface Logger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  public info(message: string, details: Record<string, unknown> = {}): void {
    console.info(message, details);
  }

  public warn(message: string, details: Record<string, unknown> = {}): void {
    console.warn(message, details);
  }
}
