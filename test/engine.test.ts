import { expect, test } from 'vitest';
import {
  newEvening,
  newHistory,
  planRound,
  recordHistory,
  recordRound,
  type Evening,
  type Plan,
  type Player,
} from '../src/engine/engine.ts';
import { seededRandom } from '../src/engine/random.ts';

// Players 25 rating points apart, strongest first: p01, p02, …
function makePlayers(count: number, overrides: (i: number) => Partial<Player> = () => ({})): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    rating: 1800 - 25 * i,
    matches: 20,
    pref: 'either',
    energy: 'normal',
    ...overrides(i),
  }));
}

const onCourt = (plan: Plan) => plan.courts.flatMap((c) => c.sides.flat());
const count = (plan: Plan, type: 'singles' | 'doubles') => plan.courts.filter((c) => c.type === type).length;

// Plays a whole evening; arrivals[r] join from round r on.
function playEvening(players: Player[], courts: number, rounds: number, arrivals: Record<number, Player[]> = {}) {
  const random = seededRandom(1);
  let evening: Evening = newEvening();
  let history = newHistory();
  const plans: Plan[] = [];
  for (let r = 0; r < rounds; r++) {
    players = players.concat(arrivals[r] ?? []);
    const plan = planRound({ players, courts, evening, history, random });
    plans.push(plan);
    evening = recordRound(evening, plan, players);
    history = recordHistory(history, plan, 0);
  }
  return { plans, evening };
}

test('every player is either on a court or resting, exactly once', () => {
  for (const [players, courts] of [[28, 8], [27, 8], [36, 8], [10, 6], [18, 6], [3, 2], [1, 4], [0, 4], [6, 0]]) {
    const list = makePlayers(players);
    const plan = planRound({ players: list, courts, random: seededRandom(1) });
    expect([...onCourt(plan), ...plan.resting].sort()).toEqual(list.map((p) => p.id).sort());
    expect(plan.courts.length).toBeLessThanOrEqual(courts);
    for (const court of plan.courts) {
      const size = court.type === 'singles' ? 1 : 2;
      expect(court.sides.map((side) => side.length)).toEqual([size, size]);
    }
  }
});

test('only as many players rest as the courts require', () => {
  const resting = (players: number, courts: number) =>
    planRound({ players: makePlayers(players), courts, random: seededRandom(1) }).resting.length;
  expect(resting(28, 8)).toBe(0);
  expect(resting(32, 8)).toBe(0);
  expect(resting(27, 8)).toBe(1); // odd number: one rests
  expect(resting(36, 8)).toBe(4);
  expect(resting(40, 8)).toBe(8);
});

test('rests rotate: nobody twice in a row, everyone once before anyone twice', () => {
  const { plans, evening } = playEvening(makePlayers(36), 8, 9);
  for (let r = 1; r < plans.length; r++) {
    for (const id of plans[r].resting) expect(plans[r - 1].resting).not.toContain(id);
  }
  // 9 rounds × 4 resting = 36: exactly one rest each.
  expect(Object.values(evening.players).map((s) => s.rests)).toEqual(Array(36).fill(1));
});

test('"skip next round" rests without forcing anyone else out, and volunteers rest first', () => {
  const players = makePlayers(33, (i) => ({ skip: i === 0, restOk: i === 20 }));
  expect(planRound({ players, courts: 8, random: seededRandom(1) }).resting).toEqual(['p01']);

  const crowded = makePlayers(33, (i) => ({ restOk: i === 20 }));
  expect(planRound({ players: crowded, courts: 8, random: seededRandom(1) }).resting).toEqual(['p21']);
});

test('a late arrival plays in their first round', () => {
  const late = makePlayers(37)[36];
  const { plans } = playEvening(makePlayers(36), 8, 6, { 3: [late] });
  expect(plans[3].resting).toHaveLength(5);
  expect(plans[3].resting).not.toContain(late.id);
});

test('the singles/doubles split follows what players want', () => {
  const split = (players: number, courts: number, pref: Player['pref']) => {
    const plan = planRound({ players: makePlayers(players, () => ({ pref })), courts, random: seededRandom(1) });
    return [count(plan, 'singles'), count(plan, 'doubles')];
  };
  expect(split(10, 6, 'singles')).toEqual([5, 0]);
  expect(split(10, 6, 'doubles')).toEqual([1, 2]); // 10 players need one singles court
  expect(split(28, 8, 'doubles')).toEqual([0, 7]);
  expect(split(24, 8, 'singles')).toEqual([4, 4]); // as much singles as 8 courts allow
});

test('singles places go to the players who want singles', () => {
  // Every third player prefers singles, the rest doubles: 6 want singles, 3 singles courts.
  const players = makePlayers(18, (i) => ({ pref: i % 3 === 0 ? 'singles' : 'doubles' }));
  const plan = planRound({ players, courts: 6, random: seededRandom(3) });
  const pref = new Map(players.map((p) => [p.id, p.pref]));
  expect(count(plan, 'singles')).toBe(3);
  for (const court of plan.courts.filter((c) => c.type === 'singles')) {
    expect(court.sides.flat().map((id) => pref.get(id))).toEqual(['singles', 'singles']);
  }
});

test('players meet others close to their own level', () => {
  const players = makePlayers(16, () => ({ pref: 'doubles' })); // 1800 down to 1425
  const plan = planRound({ players, courts: 4, random: seededRandom(4) });
  const rating = new Map(players.map((p) => [p.id, p.rating]));
  const level = (ids: string[]) => ids.map((id) => rating.get(id) ?? 0);
  for (const court of plan.courts) {
    const levels = level(court.sides.flat());
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(100);
    const [a, b] = court.sides.map((side) => level(side).reduce((x, y) => x + y) / side.length);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(50);
  }
});

test('fixed pairs play together about as often as asked', () => {
  const together = (share: number) => {
    const players = makePlayers(20, (i) => ({
      pref: 'doubles',
      partnerId: i === 6 ? 'p08' : i === 7 ? 'p07' : undefined,
      partnerShare: share,
    }));
    return playEvening(players, 5, 8).evening.fixed['p07|p08'].together;
  };
  expect(together(1)).toBeGreaterThanOrEqual(7);
  expect(together(0.5)).toBeGreaterThanOrEqual(3);
  expect(together(0.5)).toBeLessThanOrEqual(5);
});

test('players who have not met for a long time are preferred', () => {
  // Four equal singles players. Two of the three possible pairings met last week.
  const players = makePlayers(4, () => ({ rating: 1500, pref: 'singles' }));
  const lastWeek: Pick<Plan, 'courts'> = {
    courts: [
      { type: 'singles', sides: [['p01'], ['p02']] },
      { type: 'singles', sides: [['p03'], ['p04']] },
      { type: 'singles', sides: [['p01'], ['p03']] },
      { type: 'singles', sides: [['p02'], ['p04']] },
    ],
  };
  const history = recordHistory(newHistory(), lastWeek, 0);
  const plan = planRound({ players, courts: 2, history, today: 7, random: seededRandom(1) });
  const pairs = plan.courts.map((c) => c.sides.flat().sort().join('-')).sort();
  expect(pairs).toEqual(['p01-p04', 'p02-p03']);
});

test('the same seed gives the same plan', () => {
  const prefs = ['singles', 'either', 'doubles'] as const;
  const players = makePlayers(26, (i) => ({ pref: prefs[i % 3] }));
  const a = planRound({ players, courts: 8, random: seededRandom(9) });
  const b = planRound({ players, courts: 8, random: seededRandom(9) });
  expect(a).toEqual(b);
});
