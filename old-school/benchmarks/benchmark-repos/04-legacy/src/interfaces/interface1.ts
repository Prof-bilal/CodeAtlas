// Interface 1 - Interface definition

export interface Interface1 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface1Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
