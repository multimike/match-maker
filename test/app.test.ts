import { expect, test } from 'vitest';
import { seededRandom } from '../src/engine/random.ts';
import { RATING, rateRound } from '../src/engine/rating.ts';
import { capacity, emptyState, latestRound, openSession, type AppState } from '../src/app/model.ts';
import { isUpset, pickWinner, resultFromScore, winnerFromScore } from '../src/app/results.ts';
import { reduce, type Action, type MemberInput } from '../src/app/state.ts';
import { addTime, finishTimer, newTimer, pauseTimer, remaining, resumeTimer, startTimer, timerPhase } from '../src/app/timer.ts';

// A reducer with a fake clock, seeded randomness and predictable ids.
function organiser(start = new Date(2026, 9, 15, 18, 0).getTime()) {
  let state: AppState = emptyState();
  let now = start;
  let next = 0;
  const random = seededRandom(7);
  const env = () => ({ now, random, id: () => `id${++next}` });
  return {
    get state() {
      return state;
    },
    do(...actions: Action[]) {
      for (const action of actions) state = reduce(state, action, env());
      return state;
    },
    wait(ms: number) {
      now += ms;
    },
  };
}

const member = (name: string, group: 1 | 2, extra: Partial<MemberInput> = {}): Action => ({
  type: 'member/add',
  member: { name, group, pref: 'either', partnerId: null, partnerShare: 0.5, ...extra },
});

const idOf = (state: AppState, name: string) => state.members.find((m) => m.name === name)!.id;
const session = (state: AppState) => openSession(state)!;
const round = (state: AppState) => latestRound(openSession(state))!;

test('a whole evening: check-in, rounds, results, ratings and history', () => {
  const o = organiser();
  const names = ['Anna', 'Bo', 'Cleo', 'Dan', 'Ebba', 'Filip', 'Greta', 'Hugo', 'Iris', 'Jon'];
  o.do(...names.map((name, i) => member(name, i < 5 ? 1 : 2)));
  expect(o.state.members.map((m) => m.rating)).toEqual([...Array(5).fill(RATING.start[1]), ...Array(5).fill(RATING.start[2])]);

  o.do({ type: 'session/open', courts: 2, roundMinutes: 12 });
  for (const name of names.slice(0, 9)) o.do({ type: 'checkIn', memberId: idOf(o.state, name) });
  const anna = idOf(o.state, 'Anna');
  o.do({ type: 'checkIn/update', memberId: anna, skip: true });

  // Round 1: 9 here, Anna skips, 8 play on 2 courts.
  o.do({ type: 'round/plan' });
  let r = round(o.state);
  expect(r.number).toBe(1);
  expect(r.status).toBe('planned');
  expect(r.resting).toEqual([anna]);
  expect(r.courts.flatMap((c) => c.sides.flat())).toHaveLength(8);

  o.do({ type: 'round/start' });
  expect(round(o.state).status).toBe('playing');
  expect(session(o.state).checkIns[anna].skip).toBe(false); // used up by this round

  // Side A wins on every court.
  r = round(o.state);
  for (let court = 0; court < r.courts.length; court++) {
    o.do({ type: 'result/set', roundId: r.id, court, result: { winner: 0 } });
  }
  const before = o.state.members;
  o.do({ type: 'round/save' });
  r = round(o.state);
  expect(r.status).toBe('done');
  const rating = (id: string) => o.state.members.find((m) => m.id === id)!.rating;
  const was = (id: string) => before.find((m) => m.id === id)!.rating;
  for (const court of r.courts) {
    for (const id of court.sides[0]) expect(rating(id)).toBeGreaterThan(was(id));
    for (const id of court.sides[1]) expect(rating(id)).toBeLessThan(was(id));
  }
  expect(rating(anna)).toBe(was(anna));
  expect(o.state.members.find((m) => m.id === anna)!.matches).toBe(0);
  expect(session(o.state).evening.round).toBe(1);
  expect(Object.keys(o.state.history.met).length).toBeGreaterThan(0);

  // A late arrival, and Bo leaves. Round 2 has everyone here and nobody who left.
  const jon = idOf(o.state, 'Jon');
  const bo = idOf(o.state, 'Bo');
  o.do({ type: 'checkIn', memberId: jon }, { type: 'checkOut', memberId: bo }, { type: 'round/plan' });
  r = round(o.state);
  expect(r.number).toBe(2);
  const placed = [...r.courts.flatMap((c) => c.sides.flat()), ...r.resting];
  expect(placed).toContain(jon);
  expect(placed).not.toContain(bo);
  expect(placed).toHaveLength(9);
  // Anna rested last round, so she plays now.
  expect(r.resting).not.toContain(anna);

  // Rounds keep coming until the evening ends.
  for (let n = 2; n <= 4; n++) {
    o.do({ type: 'round/start' });
    o.wait(12 * 60_000);
    const playing = round(o.state);
    playing.courts.forEach((_, court) =>
      o.do({ type: 'result/set', roundId: playing.id, court, result: resultFromScore([21, 17 + court]) }));
    o.do({ type: 'round/save' }, { type: 'round/plan' });
  }
  expect(round(o.state).number).toBe(5);
  expect(session(o.state).rounds.map((x) => x.status)).toEqual(['done', 'done', 'done', 'done', 'planned']);

  o.do({ type: 'session/close' });
  expect(openSession(o.state)).toBeUndefined();
  const closed = o.state.sessions[0];
  expect(closed.rounds).toHaveLength(4); // the planned round 5 never happened
  expect(closed.rounds.every((x) => x.players.length === 0 && x.ratingsBefore === undefined)).toBe(true);
});

test('regenerating replaces the planned round; a round without results can be discarded', () => {
  const o = organiser();
  o.do(...['A', 'B', 'C', 'D', 'E', 'F'].map((name) => member(name, 1)));
  o.do({ type: 'session/open', courts: 2, roundMinutes: 15 });
  for (const m of o.state.members) o.do({ type: 'checkIn', memberId: m.id });
  o.do({ type: 'round/plan' }, { type: 'round/plan' });
  expect(session(o.state).rounds).toHaveLength(1);
  expect(round(o.state).timer.durationMs).toBe(15 * 60_000);
  o.do({ type: 'round/start' }, { type: 'round/plan' });
  expect(session(o.state).rounds).toHaveLength(1); // can't plan while a round is playing
  o.do({ type: 'round/discard' });
  expect(session(o.state).rounds).toHaveLength(0);
});

test('the latest saved round can be corrected, and only that one', () => {
  const o = organiser();
  o.do(...['A', 'B', 'C', 'D'].map((name, i) => member(name, i < 2 ? 1 : 2, { pref: 'singles' })));
  o.do({ type: 'session/open', courts: 2, roundMinutes: 12 });
  for (const m of o.state.members) o.do({ type: 'checkIn', memberId: m.id });
  o.do({ type: 'round/plan' }, { type: 'round/start' });
  const first = round(o.state);
  first.courts.forEach((_, court) => o.do({ type: 'result/set', roundId: first.id, court, result: { winner: 0 } }));
  const start = Object.fromEntries(o.state.members.map((m) => [m.id, { rating: m.rating, matches: m.matches }]));
  o.do({ type: 'round/save' });

  // Court 1 was entered the wrong way round.
  o.do({ type: 'result/set', roundId: first.id, court: 0, result: { winner: 1 } });
  const expected = rateRound(start, first, [1, ...first.courts.slice(1).map(() => 0 as const)]);
  for (const m of o.state.members) {
    expect(m.rating).toBeCloseTo(expected[m.id].rating, 9);
    expect(m.matches).toBe(expected[m.id].matches);
  }

  // Once the next round is saved, the first is history.
  o.do({ type: 'round/plan' }, { type: 'round/start' }, { type: 'round/save' });
  const frozen = o.state;
  o.do({ type: 'result/set', roundId: first.id, court: 0, result: { winner: 0 } });
  expect(o.state).toBe(frozen);
});

test('competition partners are linked both ways, and deleting a member cleans up after them', () => {
  const o = organiser();
  o.do(member('Ada', 1), member('Ben', 1), member('Cy', 2));
  const [ada, ben, cy] = ['Ada', 'Ben', 'Cy'].map((n) => idOf(o.state, n));
  o.do({ type: 'member/update', id: ada, member: { name: 'Ada', group: 1, pref: 'doubles', partnerId: ben, partnerShare: 0.75 } });
  const get = (id: string) => o.state.members.find((m) => m.id === id);
  expect(get(ben)).toMatchObject({ partnerId: ada, partnerShare: 0.75 });

  // Ben pairs up with Cy instead: Ada is let go.
  o.do({ type: 'member/update', id: ben, member: { name: 'Ben', group: 1, pref: 'either', partnerId: cy, partnerShare: 0.5 } });
  expect(get(ada)?.partnerId).toBeUndefined();
  expect(get(cy)).toMatchObject({ partnerId: ben, partnerShare: 0.5 });

  // A group change before any rated match moves the starting rating; a nudge sets it.
  o.do({ type: 'member/update', id: cy, member: { name: 'Cy', group: 1, pref: 'either', partnerId: ben, partnerShare: 0.5 } });
  expect(get(cy)?.rating).toBe(RATING.start[1]);
  o.do({ type: 'member/update', id: cy, member: { name: 'Cy', group: 1, pref: 'either', partnerId: ben, partnerShare: 0.5 }, rating: 1650 });
  expect(get(cy)?.rating).toBe(1650);

  o.do({ type: 'session/open', courts: 1, roundMinutes: 12 }, { type: 'checkIn', memberId: ben }, { type: 'checkIn', memberId: cy });
  o.do({ type: 'round/plan' }, { type: 'round/start' }, { type: 'round/save' });
  expect(Object.keys(o.state.history.met)).not.toHaveLength(0);
  o.do({ type: 'member/delete', id: ben });
  expect(get(ben)).toBeUndefined();
  expect(get(cy)?.partnerId).toBeUndefined();
  expect(session(o.state).checkIns[ben]).toBeUndefined();
  expect(Object.keys(o.state.history.met).filter((key) => key.includes(ben))).toEqual([]);
});

test('the buzzer decides: side ahead wins, a level score needs a deciding point', () => {
  expect(winnerFromScore([15, 12])).toBe(0);
  expect(winnerFromScore([9, 11])).toBe(1);
  expect(resultFromScore([14, 14])).toEqual({ winner: null, score: [14, 14] });
  expect(resultFromScore([14, 14], 1)).toEqual({ winner: 1, score: [14, 15] });
  expect(resultFromScore([21, 18], 1)).toEqual({ winner: 0, score: [21, 18] });

  // Tapping a side.
  expect(pickWinner({ winner: null }, 1)).toEqual({ winner: 1 });
  expect(pickWinner({ winner: 1 }, 1)).toEqual({ winner: null });
  expect(pickWinner({ winner: null, score: [9, 9] }, 0)).toEqual({ winner: 0, score: [10, 9] });
  expect(pickWinner({ winner: 0, score: [21, 18] }, 1)).toEqual({ winner: 1 });

  const court = { type: 'singles' as const, sides: [['a'], ['b']] as [string[], string[]] };
  const ratings = { a: { rating: 1400, matches: 20 }, b: { rating: 1500, matches: 20 } };
  expect(isUpset(court, ratings, 0)).toBe(true);
  expect(isUpset(court, ratings, 1)).toBe(false);
});

test('capacity matches the table in the design notes', () => {
  const splits = (here: number, courts: number) => {
    const c = capacity(here, 0, courts);
    return [c.playing, c.resting, c.maxSingles];
  };
  expect(splits(28, 8)).toEqual([28, 0, 2]); // 6 doubles + 2 singles
  expect(splits(24, 8)).toEqual([24, 0, 4]);
  expect(splits(18, 6)).toEqual([18, 0, 3]);
  expect(splits(10, 6)).toEqual([10, 0, 5]);
  expect(splits(27, 8)).toEqual([26, 1, 3]);
  expect(splits(36, 8)).toEqual([32, 4, 0]);
  expect(splits(40, 8)).toEqual([32, 8, 0]);
  expect(capacity(30, 2, 8, 29)).toMatchObject({ playing: 28, resting: 0, overLimit: true });
});

test('the round timer: pause, extra time, warning and buzzer', () => {
  let t = newTimer(12);
  expect(timerPhase(t, 0)).toBe('ready');
  t = startTimer(t, 1000);
  expect(remaining(t, 1000 + 60_000)).toBe(11 * 60_000);
  t = pauseTimer(t, 1000 + 60_000);
  expect(timerPhase(t, 1000 + 5 * 60_000)).toBe('paused');
  t = resumeTimer(t, 1000 + 5 * 60_000); // paused for 4 minutes
  expect(remaining(t, 1000 + 5 * 60_000)).toBe(11 * 60_000);
  expect(timerPhase(t, 1000 + 15 * 60_000)).toBe('warning'); // 1 minute left
  expect(timerPhase(t, 1000 + 16 * 60_000)).toBe('over');
  t = addTime(t, 60_000, 1000 + 20 * 60_000); // after the buzzer: a minute from now
  expect(remaining(t, 1000 + 20 * 60_000)).toBe(60_000);
  t = finishTimer(t, 1000 + 20 * 60_000 + 10_000);
  expect(timerPhase(t, 1000 + 20 * 60_000 + 10_000)).toBe('over');
});
