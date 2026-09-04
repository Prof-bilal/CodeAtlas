// Interface 4 - Interface definition

export interface Interface4 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface4Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
