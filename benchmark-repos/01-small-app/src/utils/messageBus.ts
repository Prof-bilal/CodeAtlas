export interface Message<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: Date;
  source?: string;
  target?: string;
}

export type MessageHandler<T = any> = (message: Message<T>) => Promise<void>;

export class MessageBus {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private messageQueue: Message[] = [];
  private processing: boolean = false;

  async publish<T>(message: Message<T>): Promise<void> {
    this.messageQueue.push(message);
    
    if (!this.processing) {
      await this.processQueue();
    }
  }

  subscribe(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    
    this.handlers.get(type)!.push(handler);
  }

  unsubscribe(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.dispatch(message);
    }
    
    this.processing = false;
  }

  private async dispatch(message: Message): Promise<void> {
    const handlers = this.handlers.get(message.type) || [];
    
    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`Error handling message ${message.type}:`, error);
      }
    }
  }

  getStats(): {
    queued: number;
    handlers: Record<string, number>;
  } {
    const handlers: Record<string, number> = {};
    
    for (const [type, handlerList] of this.handlers) {
      handlers[type] = handlerList.length;
    }
    
    return {
      queued: this.messageQueue.length,
      handlers,
    };
  }
}

export const messageBus = new MessageBus();
