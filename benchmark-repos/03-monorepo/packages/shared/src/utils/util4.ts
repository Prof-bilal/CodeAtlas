export interface UtilOptions4 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass4 {
  private options: UtilOptions4;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions4 = {}) {
    this.options = options;
  }

  execute(input: string): string {
    this.state.set('last', input);
    return input.toUpperCase();
  }

  getState(): Map<string, unknown> {
    return new Map(this.state);
  }

  reset(): void {
    this.state.clear();
  }
}

export function createUtil4(options?: UtilOptions4): UtilClass4 {
  return new UtilClass4(options);
}
