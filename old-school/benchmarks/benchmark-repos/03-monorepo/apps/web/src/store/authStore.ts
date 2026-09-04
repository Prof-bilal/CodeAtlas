import { User } from '../types/index.js';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> }
  | { type: 'CLEAR_ERROR' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false, error: null };
    case 'LOGIN_FAILURE':
      return { ...state, user: null, isAuthenticated: false, isLoading: false, error: action.payload };
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false, isLoading: false, error: null };
    case 'UPDATE_USER':
      return { ...state, user: state.user ? { ...state.user, ...action.payload } : null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function createAuthStore() {
  let state = initialState;
  const listeners: Array<(state: AuthState) => void> = [];

  function dispatch(action: AuthAction): void {
    state = authReducer(state, action);
    listeners.forEach(listener => listener(state));
  }

  function subscribe(listener: (state: AuthState) => void): () => void {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  function getState(): AuthState {
    return state;
  }

  function login(user: User): void {
    dispatch({ type: 'LOGIN_SUCCESS', payload: user });
  }

  function logout(): void {
    dispatch({ type: 'LOGOUT' });
  }

  function updateUser(updates: Partial<User>): void {
    dispatch({ type: 'UPDATE_USER', payload: updates });
  }

  function clearError(): void {
    dispatch({ type: 'CLEAR_ERROR' });
  }

  return { getState, dispatch, subscribe, login, logout, updateUser, clearError };
}
