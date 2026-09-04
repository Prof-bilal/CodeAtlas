// Message queue - OLD
// Uses in-memory queue (not for production)

interface QueueMessage {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
}

export class MemoryQueue {
  private messages: QueueMessage[] = [];
  private handlers: Map<string, (data: any) => Promise<void>> = new Map();

  async publish(type: string, data: any) {
    const message: QueueMessage = {
      id: msg_,
      type,
      data,
      timestamp: new Date(),
    };
    this.messages.push(message);
    await this.processMessage(message);
  }

  subscribe(type: string, handler: (data: any) => Promise<void>) {
    this.handlers.set(type, handler);
  }

  private async processMessage(message: QueueMessage) {
    const handler = this.handlers.get(message.type);
    if (handler) {
      await handler(message.data);
    }
  }

  getMessages(): QueueMessage[] {
    return [...this.messages];
  }
}
