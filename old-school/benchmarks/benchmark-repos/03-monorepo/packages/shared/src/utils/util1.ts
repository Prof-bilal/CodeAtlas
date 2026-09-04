export interface UtilOptions1 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass1 {
  private options: UtilOptions1;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions1 = {}) {
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

export function createUtil1(options?: UtilOptions1): UtilClass1 {
  return new UtilClass1(options);
}
