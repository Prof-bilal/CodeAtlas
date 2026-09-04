export interface StoreConfig13 {
  name: string;
  persistence: boolean;
  devtools: boolean;
  middleware: string[];
}
export type StoreSubscriber13 = (state: Record<string, unknown>) => void;
export class Store13 {
  private config: StoreConfig13;
  private data: Map<string, unknown> = new Map();
  private history: Array<{ action: string; state: Record<string, unknown>; timestamp: Date }> = [];
  private subscribers: Set<() => void> = new Set();
  private reducers: Map<string, (state: Record<string, unknown>, action: unknown) => Record<string, unknown>> = new Map();
  constructor(config: StoreConfig13) { this.config = config; }
  getState(): Record<string, unknown> { return Object.fromEntries(this.data); }
  setState(key: string, value: unknown): void { this.data.set(key, value); this.history.push({ action: 'SET', state: { [key]: value }, timestamp: new Date() }); this.notify(); }
  subscribe(listener: StoreSubscriber13): () => void { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; }
  private notify(): void { const state = this.getState(); this.subscribers.forEach(sub => sub(state)); }
  dispatch(action: string, payload?: unknown): void { const reducer = this.reducers.get(action); if (reducer) { const currentState = this.getState(); const newState = reducer(currentState, payload); for (const [key, value] of Object.entries(newState)) this.data.set(key, value); this.history.push({ action, state: newState, timestamp: new Date() }); this.notify(); } }
  registerReducer(action: string, reducer: (state: Record<string, unknown>, action: unknown) => Record<string, unknown>): void { this.reducers.set(action, reducer); }
  reset(): void { this.data.clear(); this.history = []; this.notify(); }
  getHistory(): Array<{ action: string; state: Record<string, unknown>; timestamp: Date }> { return [...this.history]; }
  destroy(): void { this.data.clear(); this.history = []; this.subscribers.clear(); }
}
export function createStore13(config: StoreConfig13): Store13 { return new Store13(config); }