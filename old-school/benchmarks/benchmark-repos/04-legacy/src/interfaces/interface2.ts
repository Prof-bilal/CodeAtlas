// Interface 2 - Interface definition

export interface Interface2 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface2Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
