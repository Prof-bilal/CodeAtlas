export interface UtilOptions21 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass21 {
  private options: UtilOptions21;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions21 = {}) {
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

export function createUtil21(options?: UtilOptions21): UtilClass21 {
  return new UtilClass21(options);
}
