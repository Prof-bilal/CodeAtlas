// Interface 20 - Interface definition

export interface Interface20 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface20Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
