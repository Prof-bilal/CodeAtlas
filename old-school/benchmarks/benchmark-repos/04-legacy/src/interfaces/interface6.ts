// Interface 6 - DEPRECATED

export interface Interface6 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface6Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
