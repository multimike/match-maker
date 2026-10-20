// A player's phone: signs in anonymously, joins the club with the code from the QR poster, and
// follows the members, the training groups and tonight's live view. What the player does goes to the organiser's
// device as a request (requests.ts).

import { signInAnonymously } from 'firebase/auth';
import { addDoc, collection, deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import type { LiveView } from '../live.ts';
import { DEFAULT_GROUPS, type Member, type TrainingGroup } from '../model.ts';
import type { PlayerRequest } from '../requests.ts';
import { PLAYERS } from './club.ts';
import { GROUPS, LIVE, MEMBERS, parseLive, type DocData } from './docs.ts';
import type { Cloud } from './firebase.ts';
import { REQUESTS } from './store.ts';

export type PlayerPhase =
  | 'starting'
  /** Not joined: scan the poster. `badCode` when a code was tried and refused (replaced since). */
  | 'scan'
  | 'ready'
  /** Couldn't reach the club (offline on the first visit, or something else). */
  | 'error';

export interface PlayerState {
  phase: PlayerPhase;
  badCode: boolean;
  /** The member this phone says it is. */
  memberId?: string;
  members: Member[];
  groups: TrainingGroup[];
  live: LiveView;
  /** Members and the live view have arrived. */
  loaded: boolean;
}

export interface PlayerClient {
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  /** Says who this phone is, or forgets it ("not me"). */
  setMember(memberId: string | null): Promise<void>;
  send(request: PlayerRequest): Promise<void>;
  stop(): void;
}

const CODE_KEY = 'matchmaker.joinCode';

export function createPlayerClient({ auth, db }: Cloud, code: string | null): PlayerClient {
  let state: PlayerState = { phase: 'starting', badCode: false, members: [], groups: DEFAULT_GROUPS, live: { session: null }, loaded: false };
  const listeners = new Set<() => void>();
  const set = (change: Partial<PlayerState>) => {
    state = { ...state, ...change };
    listeners.forEach((l) => l());
  };
  const unsubscribes: Unsubscribe[] = [];
  let uid = '';
  let stopped = false;

  const follow = () => {
    if (stopped) return;
    let members = false;
    let live = false;
    const loaded = () => members && live && !state.loaded && set({ loaded: true });
    unsubscribes.push(
      onSnapshot(doc(db, PLAYERS, uid), (snap) => {
        // Gone: the organiser replaced the code and signed phones out.
        if (!snap.exists()) set({ phase: 'scan', badCode: true, memberId: undefined });
        else set({ phase: 'ready', memberId: (snap.data().memberId as string | undefined) ?? undefined });
      }, () => set({ phase: 'scan' })),
      onSnapshot(doc(db, MEMBERS), (snap) => {
        const data = snap.data() as DocData | undefined;
        members = true;
        set({ members: data ? (JSON.parse(data.json) as Member[]) : [] });
        loaded();
      }, () => {}),
      // A club from before training groups has no groups document: the two it started with.
      onSnapshot(doc(db, GROUPS), (snap) => {
        const data = snap.data() as DocData | undefined;
        set({ groups: data ? (JSON.parse(data.json) as TrainingGroup[]) : DEFAULT_GROUPS });
      }, () => {}),
      onSnapshot(doc(db, LIVE), (snap) => {
        live = true;
        set({ live: parseLive((snap.data() as DocData | undefined)?.json) });
        loaded();
      }, () => {}),
    );
  };

  const start = async () => {
    try {
      await auth.authStateReady();
      uid = auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
      const ref = doc(db, PLAYERS, uid);
      if (!(await getDoc(ref)).exists()) {
        const tryCode = code ?? localStorage.getItem(CODE_KEY);
        if (!tryCode) return set({ phase: 'scan' });
        try {
          await setDoc(ref, { code: tryCode, joinedAt: serverTimestamp() });
        } catch {
          // Joined meanwhile from another tab, or the code was refused.
          if (!(await getDoc(ref)).exists()) return set({ phase: 'scan', badCode: true });
        }
      }
      if (code) localStorage.setItem(CODE_KEY, code);
      follow();
    } catch {
      set({ phase: 'error' });
    }
  };
  void start();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async setMember(memberId) {
      await updateDoc(doc(db, PLAYERS, uid), { memberId: memberId ?? deleteField() });
    },
    async send(request) {
      await addDoc(collection(db, REQUESTS), { ...request, uid, at: serverTimestamp() });
    },
    stop() {
      stopped = true;
      unsubscribes.forEach((u) => u());
    },
  };
}
