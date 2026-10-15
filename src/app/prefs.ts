// This device's own settings (language, sound), kept apart from the club's data so they stay
// local when the data moves to Firestore. Shared live between this device's windows.

import { useSyncExternalStore } from 'react';

export type Lang = 'sv' | 'en';

export interface Prefs {
  lang: Lang;
  sound: boolean;
}

const KEY = 'matchmaker.prefs';
const listeners = new Set<() => void>();

function defaults(): Prefs {
  return { lang: navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en', sound: true };
}

function read(): Prefs {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults();
  }
}

let current = read();

window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  current = read();
  listeners.forEach((l) => l());
});

export function setPrefs(change: Partial<Prefs>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved, but still applies in this window.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => current);
}
