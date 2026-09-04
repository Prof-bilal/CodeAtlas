export interface Middleware<TContext = any> {
  (context: TContext, next: () => Promise<void>): Promise<void>;
}

export class Pipeline<TContext = any> {
  private middlewares: Middleware<TContext>[] = [];

  use(middleware: Middleware<TContext>): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(context: TContext): Promise<void> {
    const middlewares = [...this.middlewares];
    
    const dispatch = async (index: number): Promise<void> => {
      if (index >= middlewares.length) {
        return;
      }
      
      const middleware = middlewares[index];
      await middleware(context, () => dispatch(index + 1));
    };
    
    await dispatch(0);
  }
}
