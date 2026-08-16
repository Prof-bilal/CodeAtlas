// Interface 9 - DEPRECATED

export interface Interface9 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface9Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
