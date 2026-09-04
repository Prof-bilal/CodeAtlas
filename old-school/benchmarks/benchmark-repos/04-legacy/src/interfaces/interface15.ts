// Interface 15 - DEPRECATED

export interface Interface15 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface15Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
