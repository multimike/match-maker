import { expect, test } from 'vitest';
import { seededRandom } from '../src/engine/random.ts';
import { RATING } from '../src/engine/rating.ts';
import { changedDocs, fromDocs, GROUPS, HISTORY, LIVE, MEMBERS, sessionPath, toDocs } from '../src/app/cloud/docs.ts';
import { liveView } from '../src/app/live.ts';
import { emptyState, latestRound, openSession, type AppState } from '../src/app/model.ts';
import { requestActions, type PlayerRequest } from '../src/app/requests.ts';
import { reduce, type Action } from '../src/app/state.ts';

// The organiser's device: a reducer with a fake clock, seeded randomness and predictable ids,
// plus phones' requests handled the way the cloud store handles them.
function organiser() {
  let state: AppState = emptyState();
  let now = new Date(2026, 9, 16, 18, 0).getTime();
  let next = 0;
  const random = seededRandom(3);
  const env = () => ({ now, random, id: () => `id${++next}` });
  const o = {
    get state() {
      return state;
    },
    do(...actions: Action[]) {
      for (const action of actions) state = reduce(state, action, env());
      return o;
    },
    phone(request: PlayerRequest) {
      return o.do(...requestActions(state, request));
    },
    wait(ms: number) {
      now += ms;
      return o;
    },
  };
  return o;
}

const add = (name: string, group: 1 | 2 = 1): Action => ({
  type: 'member/add',
  member: { name, group, pref: 'either', partnerId: null, partnerShare: 0.5 },
});
const idOf = (state: AppState, name: string) => state.members.find((m) => m.name === name)!.id;

test('signing up on a phone adds a new member with consent, once', () => {
  const o = organiser();
  const signup: PlayerRequest = { type: 'signup', memberId: 'phone1', name: '  Saga  ', group: 2, pref: 'doubles', consent: true };
  o.phone(signup).phone(signup);
  expect(o.state.members).toHaveLength(1);
  expect(o.state.members[0]).toMatchObject({ id: 'phone1', name: 'Saga', status: 'new', rating: RATING.start[2], pref: 'doubles' });
  expect(o.state.members[0].consentAt).toBeTypeOf('number');

  o.do({ type: 'member/confirm', id: 'phone1' });
  expect(o.state.members[0].status).toBe('confirmed');

  // The organiser's own form can't add a second member with the same id either.
  o.do({ type: 'member/add', id: 'phone1', member: { name: 'Other', group: 1, pref: 'either', partnerId: null, partnerShare: 0.5 } });
  expect(o.state.members).toHaveLength(1);

  // A group the phone saw that has been removed since: the club's first group instead.
  o.phone({ type: 'signup', memberId: 'phone2', name: 'Tor', group: 7, pref: 'either', consent: true });
  expect(o.state.members[1]).toMatchObject({ group: 1, rating: RATING.start[1] });
});

test('an existing member on a new phone sets their preference and gives consent', () => {
  const o = organiser().do(add('Anna'));
  const anna = idOf(o.state, 'Anna');
  expect(o.state.members[0].consentAt).toBeUndefined();
  o.phone({ type: 'profile', memberId: anna, pref: 'singles', consent: true });
  expect(o.state.members[0]).toMatchObject({ pref: 'singles' });
  const consented = o.state.members[0].consentAt;
  o.wait(60_000).phone({ type: 'profile', memberId: anna, consent: true });
  expect(o.state.members[0].consentAt).toBe(consented); // the first consent stands
  expect(requestActions(o.state, { type: 'profile', memberId: 'nobody', consent: true })).toEqual([]);
});

test('check-in, energy, skip and check-out from a phone, only while an evening is open', () => {
  const o = organiser().do(add('Anna'), add('Bo'));
  const anna = idOf(o.state, 'Anna');
  expect(requestActions(o.state, { type: 'checkIn', memberId: anna, energy: 'easy', restOk: true })).toEqual([]);

  o.do({ type: 'session/open', courts: 2, roundMinutes: 12 });
  o.phone({ type: 'checkIn', memberId: anna, energy: 'easy', restOk: true });
  expect(openSession(o.state)!.checkIns[anna]).toMatchObject({ energy: 'easy', restOk: true, skip: false });

  o.phone({ type: 'update', memberId: anna, skip: true });
  expect(openSession(o.state)!.checkIns[anna].skip).toBe(true);
  o.phone({ type: 'update', memberId: anna, energy: 'challenge' });
  expect(openSession(o.state)!.checkIns[anna]).toMatchObject({ energy: 'challenge', restOk: false });

  o.phone({ type: 'checkOut', memberId: anna });
  expect(openSession(o.state)!.checkIns[anna].leftAt).toBeTypeOf('number');
  // Not here any more: updates are dropped until they check in again.
  expect(requestActions(o.state, { type: 'update', memberId: anna, skip: false })).toEqual([]);
  o.phone({ type: 'checkIn', memberId: anna, energy: 'normal', restOk: false });
  expect(openSession(o.state)!.checkIns[anna].leftAt).toBeUndefined();
});

test('players enter results for their own court while the round is on', () => {
  const o = organiser().do(...['Anna', 'Bo', 'Cleo', 'Dan'].map((n) => add(n)));
  o.do({ type: 'session/open', courts: 2, roundMinutes: 12 });
  for (const m of o.state.members) o.phone({ type: 'checkIn', memberId: m.id, energy: 'normal', restOk: false });
  o.do({ type: 'round/plan' });
  const round = latestRound(openSession(o.state))!;
  const court = 0;
  const [mine, other] = [round.courts[court].sides.flat()[0], round.courts[1]?.sides.flat()[0]];
  const result = (memberId: string, extra: Partial<Extract<PlayerRequest, { type: 'result' }>> = {}): PlayerRequest =>
    ({ type: 'result', memberId, roundId: round.id, court, winner: 0, ...extra });

  // Not before the round starts.
  expect(requestActions(o.state, result(mine))).toEqual([]);
  o.do({ type: 'round/start' });

  // Not for someone else's court.
  if (other) expect(requestActions(o.state, result(other))).toEqual([]);

  // A level score at the buzzer: the tapped side won the deciding point.
  o.phone(result(mine, { winner: 1, score: [14, 14] }));
  expect(latestRound(openSession(o.state))!.results[court]).toEqual({ winner: 1, score: [14, 15] });
  // An impossible score is dropped.
  expect(requestActions(o.state, result(mine, { score: [31, 2] }))).toEqual([]);

  // Once the organiser has saved the round, corrections are theirs.
  o.do({ type: 'round/save' });
  expect(requestActions(o.state, result(mine, { winner: 0 }))).toEqual([]);
});

test('the live view shows phones tonight without the engine bookkeeping', () => {
  const o = organiser().do(add('Anna'), add('Bo', 2));
  expect(liveView(o.state)).toEqual({ session: null });

  o.do({ type: 'session/open', courts: 1, roundMinutes: 15 });
  for (const m of o.state.members) o.do({ type: 'checkIn', memberId: m.id });
  o.do({ type: 'round/plan' }, { type: 'round/start' });
  let live = liveView(o.state).session!;
  expect(live).toMatchObject({ courts: 1, roundMinutes: 15 });
  expect(Object.keys(live.checkIns)).toHaveLength(2);
  expect(live.round).toMatchObject({ number: 1, status: 'playing' });
  expect(live.round?.changes).toBeUndefined();
  expect(JSON.stringify(live)).not.toContain('oppDebt');

  const round = latestRound(openSession(o.state))!;
  o.do({ type: 'result/set', roundId: round.id, court: 0, result: { winner: 0 } }, { type: 'round/save' });
  live = liveView(o.state).session!;
  const [winner] = round.courts[0].sides[0];
  const [loser] = round.courts[0].sides[1];
  expect(live.round?.changes?.[winner]).toBeGreaterThan(0);
  expect(live.round?.changes?.[loser]).toBeLessThan(0);
});

test('the club fits in documents and comes back exactly, writing only what changed', () => {
  const o = organiser().do(add('Anna'), add('Bo'), add('Cleo', 2), add('Dan', 2));
  o.do({ type: 'session/open', courts: 1, roundMinutes: 12 });
  for (const m of o.state.members) o.do({ type: 'checkIn', memberId: m.id });
  o.do({ type: 'round/plan' }, { type: 'round/start' }, { type: 'round/save' }, { type: 'session/close' });
  o.do({ type: 'session/open', courts: 2, roundMinutes: 15 });

  const docs = toDocs(o.state);
  const json = new Map([...docs].filter(([path]) => path !== LIVE).map(([path, d]) => [path, d.json]));
  expect(fromDocs(json)).toEqual(o.state);
  expect(fromDocs(new Map())).toEqual(emptyState());
  // A club from before training groups has no groups document: it gets the two it started with.
  json.delete(GROUPS);
  expect(fromDocs(json).groups).toEqual(emptyState().groups);

  // Adding a group writes only the groups document.
  const beforeGroup = toDocs(o.state);
  o.do({ type: 'group/add', group: { name: 'Barn', start: 1100, hideRating: true } });
  expect(changedDocs(beforeGroup, toDocs(o.state)).map((c) => c.path)).toEqual([GROUPS]);
  // Courts are arrays inside arrays, which Firestore can't store as fields: they travel as JSON.
  expect(Object.values(docs.get(sessionPath(o.state.sessions[0].id))!)).toEqual([expect.any(String), 'closed', expect.any(String)]);

  // Checking someone in tonight touches tonight's session and the live view, nothing else.
  const before = toDocs(o.state);
  o.do({ type: 'checkIn', memberId: idOf(o.state, 'Anna') });
  const tonight = sessionPath(openSession(o.state)!.id);
  expect(changedDocs(before, toDocs(o.state)).map((c) => c.path).sort()).toEqual([LIVE, tonight].sort());

  // Starting over deletes the evenings' documents and empties the rest.
  const wiped = changedDocs(toDocs(o.state), toDocs(emptyState()));
  expect(wiped.filter((c) => c.data === null).map((c) => c.path).sort()).toEqual(o.state.sessions.map((s) => sessionPath(s.id)).sort());
  expect(wiped.map((c) => c.path)).toEqual(expect.arrayContaining([MEMBERS, GROUPS, HISTORY, LIVE]));
});
