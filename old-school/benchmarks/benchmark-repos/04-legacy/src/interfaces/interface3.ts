// Interface 3 - DEPRECATED

export interface Interface3 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface3Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
