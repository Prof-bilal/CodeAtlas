import { describe, it, expect } from 'vitest';
import { MessageBus } from '../src/utils/messageBus.js';
import { JobQueue } from '../src/utils/jobQueue.js';
import { StateMachine } from '../src/utils/stateMachine.js';

describe('MessageBus', () => {
  it('should publish and subscribe to messages', async () => {
    const bus = new MessageBus();
    const received: any[] = [];
    
    bus.subscribe('test', async (message) => {
      received.push(message);
    });
    
    await bus.publish({
      id: '1',
      type: 'test',
      payload: { data: 'hello' },
      timestamp: new Date(),
    });
    
    expect(received).toHaveLength(1);
    expect(received[0].payload.data).toBe('hello');
  });

  it('should unsubscribe from messages', async () => {
    const bus = new MessageBus();
    const received: any[] = [];
    
    const handler = async (message: any) => {
      received.push(message);
    };
    
    bus.subscribe('test', handler);
    bus.unsubscribe('test', handler);
    
    await bus.publish({
      id: '1',
      type: 'test',
      payload: { data: 'hello' },
      timestamp: new Date(),
    });
    
    expect(received).toHaveLength(0);
  });
});

describe('JobQueue', () => {
  it('should add and process jobs', async () => {
    const queue = new JobQueue();
    const processed: string[] = [];
    
    queue.registerProcessor('test', async (job) => {
      processed.push(job.id);
    });
    
    const job = await queue.addJob('test', { data: 'hello' });
    await queue.processNext();
    
    expect(processed).toHaveLength(1);
    expect(job.status).toBe('completed');
  });

  it('should handle processor errors', async () => {
    const queue = new JobQueue();
    
    queue.registerProcessor('test', async () => {
      throw new Error('Processing failed');
    });
    
    const job = await queue.addJob('test', { data: 'hello' }, { maxAttempts: 1 });
    await queue.processNext();
    
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Processing failed');
  });

  it('should retry on failure', async () => {
    const queue = new JobQueue();
    let attempts = 0;
    
    queue.registerProcessor('test', async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Temporary failure');
      }
    });
    
    const job = await queue.addJob('test', { data: 'hello' }, { maxAttempts: 3 });
    
    await queue.processNext();
    expect(job.status).toBe('pending');
    
    await queue.processNext();
    expect(job.status).toBe('completed');
    expect(attempts).toBe(2);
  });
});

describe('StateMachine', () => {
  it('should transition between states', async () => {
    type States = 'idle' | 'running' | 'completed';
    
    const sm = new StateMachine<States, {}>('idle', {});
    
    sm.addState({ name: 'idle' });
    sm.addState({ name: 'running' });
    sm.addState({ name: 'completed' });
    
    sm.addTransition({ from: 'idle', to: 'running', event: 'start' });
    sm.addTransition({ from: 'running', to: 'completed', event: 'finish' });
    
    expect(sm.getState()).toBe('idle');
    
    await sm.send('start');
    expect(sm.getState()).toBe('running');
    
    await sm.send('finish');
    expect(sm.getState()).toBe('completed');
  });

  it('should check available events', () => {
    type States = 'idle' | 'running';
    
    const sm = new StateMachine<States, {}>('idle', {});
    
    sm.addState({ name: 'idle' });
    sm.addState({ name: 'running' });
    
    sm.addTransition({ from: 'idle', to: 'running', event: 'start' });
    
    expect(sm.canTransition('start')).toBe(true);
    expect(sm.canTransition('stop')).toBe(false);
    expect(sm.getAvailableEvents()).toEqual(['start']);
  });

  it('should run guards', async () => {
    type States = 'idle' | 'running';
    
    const sm = new StateMachine<States, {}>('idle', {});
    
    sm.addState({ name: 'idle' });
    sm.addState({ name: 'running' });
    
    sm.addTransition({
      from: 'idle',
      to: 'running',
      event: 'start',
      guard: () => false,
    });
    
    await expect(sm.send('start')).rejects.toThrow('Guard failed');
    expect(sm.getState()).toBe('idle');
  });
});
