// Interface 12 - DEPRECATED

export interface Interface12 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface12Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
