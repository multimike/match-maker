// Connects the reducer in state.ts to storage and to React. Each action is reduced once, saved,
// and then every component re-renders from the new state. Changes made in another window (the
// TV window) arrive through storage.subscribe.

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppState } from './model.ts';
import { reduce, type Action, type Env } from './state.ts';
import type { AppStorage } from './storage.ts';

export interface Store {
  getState(): AppState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  /** Set when the last save failed, cleared by the next one that works. */
  getSaveError(): unknown;
}

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Short random ids: they end up in the history's pair keys, so length matters a little. */
export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

export function browserEnv(): Env {
  return { now: Date.now(), random: Math.random, id: newId };
}

export function createStore(storage: AppStorage): Store {
  let state = storage.load();
  let saveError: unknown = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  storage.subscribe((next) => {
    state = next;
    emit();
  });

  return {
    getState: () => state,
    getSaveError: () => saveError,
    dispatch(action) {
      const next = reduce(state, action, browserEnv());
      if (next === state) return;
      state = next;
      try {
        storage.save(state);
        saveError = null;
      } catch (error) {
        saveError = error;
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const StoreContext = createContext<Store | null>(null);

function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}

export function useAppState(): AppState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useDispatch(): Store['dispatch'] {
  return useStore().dispatch;
}

export function useSaveError(): unknown {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSaveError);
}
