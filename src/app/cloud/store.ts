// The club's data in Firestore, behind the same Store as on one device (store.ts): actions go
// through the reducer, and the documents that changed are written in one batch. Firestore keeps
// a copy on the device, so the evening carries on when the hall's Wi-Fi drops, and the changes
// go up when it comes back.
//
// Organisers' devices are the only writers of the club's data. Phones send requests instead
// (requests.ts), which the organiser's main window turns into ordinary actions here.

import { collection, deleteDoc, doc, onSnapshot, orderBy, query, writeBatch, type Firestore, type Unsubscribe } from 'firebase/firestore';
import type { AppState } from '../model.ts';
import { requestActions, type PlayerRequest } from '../requests.ts';
import { reduce } from '../state.ts';
import { browserEnv, type Store } from '../store.ts';
import { HISTORY, MEMBERS, SESSIONS, changedDocs, fromDocs, toDocs, type DocData } from './docs.ts';

export const REQUESTS = 'requests';

export interface CloudStore extends Store {
  /** Resolves once the club's data has been read (from the device's copy or the server). */
  ready: Promise<void>;
  stop(): void;
}

export function createCloudStore(db: Firestore, { handleRequests }: { handleRequests: boolean }): CloudStore {
  // Each document's JSON as this device last read or wrote it, and what it parsed to.
  const json = new Map<string, string>();
  const parsed = new Map<string, { text: string; value: unknown }>();
  const parse = (path: string, text: string) => {
    const known = parsed.get(path);
    if (known?.text === text) return known.value;
    const value: unknown = JSON.parse(text);
    parsed.set(path, { text, value });
    return value;
  };

  let state: AppState = fromDocs(json);
  let written = toDocs(state);
  let saveError: unknown = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const unsubscribes: Unsubscribe[] = [];
  let stopped = false;

  const reload = () => {
    state = fromDocs(json, parse);
    written = toDocs(state);
    emit();
  };
  const failed = (error: unknown) => {
    saveError = error;
    emit();
  };

  // A document changed elsewhere, or arrived for the first time. Changes this device made are
  // already in `state` (and Firestore reports them as pending): only take the others.
  const take = (path: string, data: DocData | undefined, pending: boolean) => {
    if (pending) return false;
    if (data) json.set(path, data.json);
    else json.delete(path);
    return true;
  };

  let waiting = 3;
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  const firstTime = () => {
    let first = true;
    return () => {
      if (!first) return;
      first = false;
      if (--waiting === 0) markReady();
    };
  };

  // A listener that fails (signed out, no longer an organiser) still counts as loaded, so the
  // screens come up and show the error instead of waiting forever.
  for (const path of [MEMBERS, HISTORY]) {
    const loaded = firstTime();
    unsubscribes.push(onSnapshot(doc(db, path), (snap) => {
      if (take(path, snap.data() as DocData | undefined, snap.metadata.hasPendingWrites)) reload();
      loaded();
    }, (error) => {
      failed(error);
      loaded();
    }));
  }

  const sessionsLoaded = firstTime();
  unsubscribes.push(onSnapshot(collection(db, SESSIONS), (snap) => {
    let changed = false;
    for (const change of snap.docChanges()) {
      const data = change.type === 'removed' ? undefined : (change.doc.data() as DocData);
      changed = take(`${SESSIONS}/${change.doc.id}`, data, change.doc.metadata.hasPendingWrites) || changed;
    }
    if (changed) reload();
    sessionsLoaded();
  }, (error) => {
    failed(error);
    sessionsLoaded();
  }));

  const store: CloudStore = {
    ready,
    getState: () => state,
    getSaveError: () => saveError,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const next = reduce(state, action, browserEnv());
      if (next === state) return;
      const docs = toDocs(next);
      const changes = changedDocs(written, docs);
      state = next;
      written = docs;
      for (const { path, data } of changes) {
        if (data) json.set(path, data.json);
        else json.delete(path);
      }
      emit();
      if (changes.length === 0) return;
      const batch = writeBatch(db);
      for (const { path, data } of changes) {
        if (data) batch.set(doc(db, path), data);
        else batch.delete(doc(db, path));
      }
      // Offline, this waits until the device is back online; it only fails if the server says no.
      batch.commit().then(() => {
        if (saveError === null) return;
        saveError = null;
        emit();
      }, failed);
    },
    stop() {
      stopped = true;
      unsubscribes.forEach((u) => u());
    },
  };

  // Phones' requests, oldest first, once the club's data is here to check them against. Each is
  // deleted when handled; handling one twice (two organiser devices) does no harm.
  if (handleRequests) {
    const handled = new Set<string>();
    ready.then(() => {
      if (stopped) return;
      unsubscribes.push(onSnapshot(query(collection(db, REQUESTS), orderBy('at')), (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added' || handled.has(change.doc.id)) continue;
          handled.add(change.doc.id);
          const { uid: _uid, at: _at, ...request } = change.doc.data();
          for (const action of requestActions(state, request as PlayerRequest)) store.dispatch(action);
          deleteDoc(change.doc.ref).catch(() => {});
        }
      }, failed));
    });
  }

  return store;
}
