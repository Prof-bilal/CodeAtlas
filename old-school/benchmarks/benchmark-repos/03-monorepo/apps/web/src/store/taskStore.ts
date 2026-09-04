import { Task } from '../types/index.js';

export interface TaskState {
  tasks: Task[];
  selectedTask: Task | null;
  isLoading: boolean;
  error: string | null;
  filters: TaskFilters;
  pagination: { page: number; limit: number; total: number };
}

export interface TaskFilters {
  status?: string[];
  priority?: string[];
  assigneeId?: string;
  projectId?: string;
  search?: string;
}

export type TaskAction =
  | { type: 'FETCH_TASKS_START' }
  | { type: 'FETCH_TASKS_SUCCESS'; payload: { tasks: Task[]; total: number } }
  | { type: 'FETCH_TASKS_FAILURE'; payload: string }
  | { type: 'SELECT_TASK'; payload: Task | null }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'REMOVE_TASK'; payload: string }
  | { type: 'SET_FILTERS'; payload: TaskFilters }
  | { type: 'SET_PAGE'; payload: number };

const initialState: TaskState = {
  tasks: [],
  selectedTask: null,
  isLoading: false,
  error: null,
  filters: {},
  pagination: { page: 1, limit: 20, total: 0 },
};

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case 'FETCH_TASKS_START':
      return { ...state, isLoading: true, error: null };
    case 'FETCH_TASKS_SUCCESS':
      return {
        ...state,
        tasks: action.payload.tasks,
        isLoading: false,
        pagination: { ...state.pagination, total: action.payload.total },
      };
    case 'FETCH_TASKS_FAILURE':
      return { ...state, isLoading: false, error: action.payload };
    case 'SELECT_TASK':
      return { ...state, selectedTask: action.payload };
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t),
        selectedTask: state.selectedTask?.id === action.payload.id ? action.payload : state.selectedTask,
      };
    case 'REMOVE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter(t => t.id !== action.payload),
        selectedTask: state.selectedTask?.id === action.payload ? null : state.selectedTask,
      };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload, pagination: { ...state.pagination, page: 1 } };
    case 'SET_PAGE':
      return { ...state, pagination: { ...state.pagination, page: action.payload } };
    default:
      return state;
  }
}

export function createTaskStore() {
  let state = initialState;
  const listeners: Array<(state: TaskState) => void> = [];

  function dispatch(action: TaskAction): void {
    state = taskReducer(state, action);
    listeners.forEach(listener => listener(state));
  }

  function subscribe(listener: (state: TaskState) => void): () => void {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  function getState(): TaskState {
    return state;
  }

  return { getState, dispatch, subscribe };
}
