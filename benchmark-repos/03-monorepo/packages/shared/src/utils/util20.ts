export interface UtilOptions20 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass20 {
  private options: UtilOptions20;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions20 = {}) {
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

export function createUtil20(options?: UtilOptions20): UtilClass20 {
  return new UtilClass20(options);
}
