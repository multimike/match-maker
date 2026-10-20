// How the app's data maps onto Firestore documents:
//
//   club/members    all members (players read it too: names, ratings)
//   club/groups     the training groups (players read it too, to sign up)
//   club/history    when each pair last met (organisers only)
//   sessions/{id}   one per evening, open or closed (organisers only)
//   live/current    what phones see of tonight (see live.ts)
//
// Each document's content is one JSON string. Firestore can't store arrays inside arrays (a
// court's two sides) or undefined, and a string keeps the data exactly as the reducer made it.
// Only fields that a query needs sit next to it. No Firebase imports, so the tests can use it.

import { liveView, type LiveView } from '../live.ts';
import { emptyState, type AppState, type Member, type Session, type TrainingGroup } from '../model.ts';

export const MEMBERS = 'club/members';
export const GROUPS = 'club/groups';
export const HISTORY = 'club/history';
export const LIVE = 'live/current';
export const SESSIONS = 'sessions';

export const sessionPath = (id: string) => `${SESSIONS}/${id}`;

export interface DocData {
  json: string;
  /** Sessions only: for listing evenings without reading them. */
  state?: Session['state'];
  date?: string;
}

/** Every document the state is stored in, by path. */
export function toDocs(state: AppState): Map<string, DocData> {
  const docs = new Map<string, DocData>([
    [MEMBERS, { json: JSON.stringify(state.members) }],
    [GROUPS, { json: JSON.stringify(state.groups) }],
    [HISTORY, { json: JSON.stringify(state.history) }],
    [LIVE, { json: JSON.stringify(liveView(state)) }],
  ]);
  for (const s of state.sessions) docs.set(sessionPath(s.id), { json: JSON.stringify(s), state: s.state, date: s.date });
  return docs;
}

/** The documents to write (data) or delete (null) to go from `before` to `after`. */
export function changedDocs(before: Map<string, DocData>, after: Map<string, DocData>): { path: string; data: DocData | null }[] {
  const changes: { path: string; data: DocData | null }[] = [];
  for (const [path, data] of after) if (before.get(path)?.json !== data.json) changes.push({ path, data });
  for (const path of before.keys()) if (!after.has(path)) changes.push({ path, data: null });
  return changes;
}

/**
 * The state from documents' JSON by path. Missing documents mean an empty club. `parse` lets
 * the cloud store reuse what it parsed before for documents that haven't changed.
 */
export function fromDocs(json: Map<string, string>, parse: (path: string, text: string) => unknown = (_, text) => JSON.parse(text)): AppState {
  const state = emptyState();
  const members = json.get(MEMBERS);
  const groups = json.get(GROUPS);
  const history = json.get(HISTORY);
  const sessions: Session[] = [];
  for (const [path, text] of json) if (path.startsWith(`${SESSIONS}/`)) sessions.push(parse(path, text) as Session);
  return {
    ...state,
    members: members ? (parse(MEMBERS, members) as Member[]) : state.members,
    groups: groups ? (parse(GROUPS, groups) as TrainingGroup[]) : state.groups,
    history: history ? (parse(HISTORY, history) as AppState['history']) : state.history,
    sessions: sessions.sort((a, b) => a.openedAt - b.openedAt),
  };
}

export function parseLive(json: string | undefined): LiveView {
  return json ? (JSON.parse(json) as LiveView) : { session: null };
}
