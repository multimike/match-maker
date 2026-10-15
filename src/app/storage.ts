// Where the app keeps its data: for now the browser's localStorage on the organiser's device.
// Step 3 swaps in Firestore behind the same AppStorage interface; nothing else reads or writes
// the data directly.

import { emptyState, type AppState } from './model.ts';

export interface AppStorage {
  load(): AppState;
  /** Throws if the data can't be saved (storage full). */
  save(state: AppState): void;
  /** Calls back when another window changes the data. Returns a function that unsubscribes. */
  subscribe(onChange: (state: AppState) => void): () => void;
}

const KEY = 'matchmaker.data';

export function localStorageBackend(key = KEY): AppStorage {
  return {
    load() {
      const json = localStorage.getItem(key);
      try {
        return json === null ? emptyState() : parseState(json);
      } catch {
        // Keep unreadable data aside rather than overwrite it on the next save.
        localStorage.setItem(`${key}.unreadable.${Date.now()}`, json ?? '');
        return emptyState();
      }
    },
    save(state) {
      localStorage.setItem(key, JSON.stringify(state));
    },
    subscribe(onChange) {
      const listener = (event: StorageEvent) => {
        if (event.key !== key || event.newValue === null) return;
        try {
          onChange(parseState(event.newValue));
        } catch {
          // Another window wrote something unreadable; keep what we have.
        }
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  };
}

/** Reads saved data or a backup file. Throws if it isn't the app's data. */
export function parseState(json: string): AppState {
  const data = JSON.parse(json) as Partial<AppState> | null;
  if (!data || data.version !== 1 || !Array.isArray(data.members) || !Array.isArray(data.sessions)) {
    throw new Error('Not Matchmaker data');
  }
  return { ...emptyState(), ...data, history: data.history ?? { met: {} } } as AppState;
}

export function backupFileName(time: number): string {
  return `matchmaker-${new Date(time).toISOString().slice(0, 10)}.json`;
}
