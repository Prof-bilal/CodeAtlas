// Interface 13 - Interface definition

export interface Interface13 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface13Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
