export interface UtilOptions2 {
  enabled?: boolean;
  timeout?: number;
}

export class UtilClass2 {
  private options: UtilOptions2;
  private state: Map<string, unknown> = new Map();

  constructor(options: UtilOptions2 = {}) {
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

export function createUtil2(options?: UtilOptions2): UtilClass2 {
  return new UtilClass2(options);
}
