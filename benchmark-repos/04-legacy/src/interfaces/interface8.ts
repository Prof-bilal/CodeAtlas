// Interface 8 - Interface definition

export interface Interface8 {
  id: string;
  name: string;
  execute(input: any): Promise<any>;
  validate?(input: any): boolean;
}

export interface Interface8Options {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}
