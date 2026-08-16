export interface UtilOptions3 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass3 {
  private options: UtilOptions3;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions3 = {}) {
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

export function createUtil3(options?: UtilOptions3): UtilClass3 {
  return new UtilClass3(options);
}
