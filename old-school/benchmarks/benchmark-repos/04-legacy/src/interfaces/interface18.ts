// Interface 18 - DEPRECATED

export interface Interface18 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface18Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
