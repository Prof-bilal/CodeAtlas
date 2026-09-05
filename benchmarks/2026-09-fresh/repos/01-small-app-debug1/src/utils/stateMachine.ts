export interface State<TState extends string, TContext = any> {
  name: TState;
  onEnter?: (context: TContext) => Promise<void>;
  onExit?: (context: TContext) => Promise<void>;
}

export interface Transition<TState extends string> {
  from: TState;
  to: TState;
  event: string;
  guard?: () => boolean;
}

export class StateMachine<TState extends string, TContext = any> {
  private currentState: TState;
  private states: Map<TState, State<TState, TContext>> = new Map();
  private transitions: Transition<TState>[] = [];
  private context: TContext;

  constructor(initialState: TState, context: TContext) {
    this.currentState = initialState;
    this.context = context;
  }

  addState(state: State<TState, TContext>): void {
    this.states.set(state.name, state);
  }

  addTransition(transition: Transition<TState>): void {
    this.transitions.push(transition);
  }

  async send(event: string): Promise<void> {
    const transition = this.transitions.find(
      t => t.from === this.currentState && t.event === event
    );
    
    if (!transition) {
      throw new Error(`No transition found from ${this.currentState} for event ${event}`);
    }
    
    if (transition.guard && !transition.guard()) {
      throw new Error(`Guard failed for transition from ${this.currentState} to ${transition.to}`);
    }
    
    const currentStateObj = this.states.get(this.currentState);
    if (currentStateObj?.onExit) {
      await currentStateObj.onExit(this.context);
    }
    
    this.currentState = transition.to;
    
    const newStateObj = this.states.get(this.currentState);
    if (newStateObj?.onEnter) {
      await newStateObj.onEnter(this.context);
    }
  }

  getState(): TState {
    return this.currentState;
  }

  getContext(): TContext {
    return this.context;
  }

  canTransition(event: string): boolean {
    return this.transitions.some(
      t => t.from === this.currentState && t.event === event
    );
  }

  getAvailableEvents(): string[] {
    return this.transitions
      .filter(t => t.from === this.currentState)
      .map(t => t.event);
  }
}
