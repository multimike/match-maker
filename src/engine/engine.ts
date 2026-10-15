// Matchmaking engine: decides who rests, how many courts play singles or doubles, and who
// plays whom. No React, DOM or storage access, so the app, the tests and the simulation
// (sim/simulate.ts) all run exactly the same code.
//
// One evening:
//   let evening = newEvening();
//   each round:
//     const plan = planRound({ players, courts, evening, history, today });
//     evening = recordRound(evening, plan, players);
//     history = recordHistory(history, plan, today);
//
// Every candidate line-up gets a cost (lower is better) and a search looks for a cheap one.
// WEIGHTS says how much each wish counts; the simulation is the tool for tuning them.

import { isProvisional } from './rating.ts';
import { shuffled, type Random } from './random.ts';

export type Pref = 'singles' | 'doubles' | 'either';
export type Energy = 'challenge' | 'normal' | 'easy';
export type CourtType = 'singles' | 'doubles';

/** A checked-in player as the engine sees them. */
export interface Player {
  id: string;
  rating: number;
  /** Rated matches so far; the rating is provisional while they're few (see rating.ts). */
  matches?: number;
  pref?: Pref;
  /** Energy level for the night. */
  energy?: Energy;
  /** Fixed competition partner, and how often to pair them (0–1). */
  partnerId?: string;
  partnerShare?: number;
  /** Easy-night opt-in to be first to rest when someone has to. */
  restOk?: boolean;
  /** Rests this round ("skip next round"). */
  skip?: boolean;
}

export interface Court {
  type: CourtType;
  /** One player per side in singles, two in doubles. */
  sides: [string[], string[]];
}

export interface Plan {
  round: number;
  courts: Court[];
  resting: string[];
  /** Total cost of the line-up; useful for comparing weights, meaningless on its own. */
  cost: number;
}

/** Per-player bookkeeping for one evening. */
export interface PlayerStats {
  arrived: number;
  played: number;
  rests: number;
  restedLast: boolean;
  singles: number;
  /** Fair share of singles so far, compared with `singles` actually played. */
  singlesDue: number;
  /** Challenge debt: how much the player has played down lately (hundreds of points). */
  oppDebt: number;
  /** The same for carrying a weaker partner. */
  partnerDebt: number;
  /** Partners of very different level tonight. */
  bigGaps: number;
}

export interface Evening {
  round: number;
  players: Record<string, PlayerStats>;
  /** How many times each pair has met tonight. Keyed by pairKey(). */
  met: Record<string, { opp: number; partner: number }>;
  /** Fixed pairs: rounds both played, and rounds they were partners. */
  fixed: Record<string, { both: number; together: number }>;
}

/** Across evenings: the day each pair last met. `today` in planRound uses the same days. */
export interface History {
  met: Record<string, { opp?: number; partner?: number }>;
}

// Tuned with the simulation; see docs/simulation.md for what each change did.
export const WEIGHTS = {
  // Opponents within this many rating points count as equal.
  margin: 50,
  // How much playing down costs, by the player's energy level for the night.
  energy: { challenge: 1.5, normal: 1, easy: 0.25 } as Record<Energy, number>,
  // Challenge debt: playing down builds it up, and each unit makes playing down again this
  // much costlier. It fades by debtDecay each round, so it reflects the last few rounds.
  debt: 2,
  debtDecay: 0.6,
  // Playing up is welcome, but a crushing defeat isn't.
  crushing: 0.5,
  crushingGap: 300,
  // Doubles: the two sides should be close in strength...
  balance: 2,
  balanceMargin: 25,
  // ...and nobody should face opponents far below themselves.
  opposition: 1.5,
  // Partners: similar or slightly stronger is best. A weaker partner costs the stronger
  // player, a much stronger one costs a little. Very different partners are fine now and
  // then, but each one in an evening makes the next costlier.
  partner: 1.2,
  partnerMargin: 25,
  partnerUp: 0.3,
  partnerUpLimit: 150,
  bigGap: 2,
  bigGapPoints: 150,
  // Fixed competition pairs: bonus for pairing them while they're behind their share.
  fixedPair: 8,
  // Meeting the same person again in one evening.
  repeatOpp: 1,
  repeatPartner: 2,
  repeatCross: 0.5, // opponents earlier and partners now, or the other way round
  // Bonus for meeting someone you haven't met for a while; full after freshWeeks weeks.
  fresh: 0.4,
  freshWeeks: 8,
  // Two provisional players together tell the ratings less than one with a settled rating.
  provisional: 0.3,
  // Singles or doubles according to preference and a fair share over the evening. Someone
  // who prefers doubles only plays singles when levels leave no reasonable alternative.
  type: 2,
  prefersDoubles: 10,
  // How much each preference wants singles, for choosing how many singles courts to run and
  // sharing the places out fairly.
  singlesWant: { singles: 1, either: 0.5, doubles: 0 } as Record<Pref, number>,
  // Search effort: candidate swaps per player per search.
  effort: 200,
};

export type Weights = typeof WEIGHTS;
export type WeightOverrides = Partial<Omit<Weights, 'energy' | 'singlesWant'>> & {
  energy?: Partial<Weights['energy']>;
  singlesWant?: Partial<Weights['singlesWant']>;
};

export function newEvening(): Evening {
  return { round: 0, players: {}, met: {}, fixed: {} };
}

export function newHistory(): History {
  return { met: {} };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function withDefaults(weights: WeightOverrides = {}): Weights {
  return {
    ...WEIGHTS,
    ...weights,
    energy: { ...WEIGHTS.energy, ...weights.energy },
    singlesWant: { ...WEIGHTS.singlesWant, ...weights.singlesWant },
  };
}

// Someone seen for the first time mid-evening counts as having rested as much as anyone, so a
// late arrival isn't first in line to sit out.
function statsFor(evening: Evening, id: string): PlayerStats {
  const known = evening.players[id];
  if (known) return known;
  let rests = 0;
  for (const s of Object.values(evening.players)) rests = Math.max(rests, s.rests);
  return {
    arrived: evening.round,
    played: 0,
    rests,
    restedLast: false,
    singles: 0,
    singlesDue: 0,
    oppDebt: 0,
    partnerDebt: 0,
    bigGaps: 0,
  };
}

export interface PlanInput {
  /** Everyone checked in for this round. */
  players: Player[];
  courts: number;
  evening?: Evening;
  history?: History;
  /** Day number, in the same days as `history`. */
  today?: number;
  random?: Random;
  weights?: WeightOverrides;
}

export function planRound({
  players,
  courts,
  evening = newEvening(),
  history = newHistory(),
  today = 0,
  random = Math.random,
  weights,
}: PlanInput): Plan {
  const w = withDefaults(weights);
  const skipping = players.filter((p) => p.skip).map((p) => p.id);
  const available = players.filter((p) => !p.skip);
  const playing = Math.min(4 * courts, available.length - (available.length % 2));
  const benched = chooseResting(available, available.length - playing, evening, random);
  const active = available.filter((p) => !benched.includes(p.id));
  const singlesSlots = chooseSinglesSlots(active, courts, w);
  const lineup = findLineup(active, singlesSlots, { evening, history, today, random, w });
  return {
    round: evening.round + 1,
    courts: lineup.courts,
    resting: [...skipping, ...benched],
    cost: lineup.cost,
  };
}

// Who sits out when there are more players than places: volunteers first, then whoever has
// rested least. Nobody rests twice in a row, or in the round they arrive, if it can be avoided.
function chooseResting(available: Player[], count: number, evening: Evening, random: Random): string[] {
  if (count <= 0) return [];
  return available
    .map((p) => {
      const s = statsFor(evening, p.id);
      let key = s.rests + random() / 2;
      if (p.restOk) key -= 10;
      if (s.arrived === evening.round && evening.round > 0) key += 50;
      if (s.restedLast) key += 100;
      return { id: p.id, key };
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((r) => r.id);
}

function singlesWant(player: Player, w: Weights): number {
  const want = w.singlesWant[player.pref ?? 'either'];
  return player.energy === 'easy' ? want / 2 : want;
}

// Each player's fair share of this round's singles places, by how much they want singles. Nobody
// gets more than one place; what's left over goes to the others in proportion, and players who
// prefer doubles only share what nobody else can take.
function singlesShares(players: Player[], singlesSlots: number, w: Weights): number[] {
  const wants = players.map((p) => singlesWant(p, w));
  const shares = wants.map(() => 0);
  let open = wants.flatMap((want, i) => (want > 0 ? [i] : []));
  let left = singlesSlots;
  while (left > 1e-9 && open.length) {
    const demand = open.reduce((sum, i) => sum + wants[i], 0);
    const full = open.filter((i) => (left * wants[i]) / demand >= 1);
    if (!full.length) {
      for (const i of open) shares[i] = (left * wants[i]) / demand;
      left = 0;
    } else {
      for (const i of full) shares[i] = 1;
      left -= full.length;
      open = open.filter((i) => !full.includes(i));
    }
  }
  const rest = wants.flatMap((want, i) => (want > 0 ? [] : [i]));
  if (left > 1e-9 && rest.length) for (const i of rest) shares[i] = Math.min(1, left / rest.length);
  return shares;
}

// How many singles places (two per singles court) so that everyone plays and the number of
// singles places is as close as possible to the demand. Ties go to doubles.
function chooseSinglesSlots(players: Player[], courts: number, w: Weights): number {
  const n = players.length;
  const demand = players.reduce((sum, p) => sum + singlesWant(p, w), 0);
  let best: number | null = null;
  for (let s = 0; 2 * s <= n; s++) {
    const doublesPlayers = n - 2 * s;
    if (doublesPlayers % 4 || s + doublesPlayers / 4 > courts) continue;
    if (best === null || Math.abs(2 * s - demand) < Math.abs(best - demand)) best = 2 * s;
  }
  return best ?? 0;
}

interface Context {
  evening: Evening;
  history: History;
  today: number;
  random: Random;
  w: Weights;
}

// Where each court's players sit in the search's slot array: a singles court uses two slots,
// a doubles court four (side A, side A, side B, side B).
interface Slot {
  type: CourtType;
  start: number;
  size: number;
}

interface CostModel {
  priority: number[];
  rating: number[];
  court(slots: number[], slot: Slot): number;
}

function findLineup(players: Player[], singlesSlots: number, context: Context): { courts: Court[]; cost: number } {
  const n = players.length;
  if (n === 0) return { courts: [], cost: 0 };
  const model = costModel(players, singlesSlots, context);
  const layout: Slot[] = [];
  for (let start = 0; start < singlesSlots; start += 2) layout.push({ type: 'singles', start, size: 2 });
  for (let start = singlesSlots; start < n; start += 4) layout.push({ type: 'doubles', start, size: 4 });

  const iterations = context.w.effort * n;
  const starts = [greedyStart(n, singlesSlots, model), shuffled([...Array(n).keys()], context.random)];
  let best = { slots: starts[0], total: Infinity };
  for (const start of starts) {
    const result = anneal(start, layout, model, context.random, iterations);
    if (result.total < best.total) best = result;
  }

  const rating = new Map(players.map((p) => [p.id, p.rating]));
  const level = (court: Court) => {
    const ids = court.sides.flat();
    return ids.reduce((sum, id) => sum + (rating.get(id) ?? 0), 0) / ids.length;
  };
  const courts = layout
    .map(({ type, start, size }): Court => {
      const ids = best.slots.slice(start, start + size).map((i) => players[i].id);
      return { type, sides: type === 'singles' ? [[ids[0]], [ids[1]]] : [[ids[0], ids[1]], [ids[2], ids[3]]] };
    })
    .sort((a, b) => level(b) - level(a));
  return { courts, cost: best.total };
}

// A sensible first guess: the players most owed singles play singles, everyone else in
// rating order in fours, strongest and weakest of each four against the middle two.
function greedyStart(n: number, singlesSlots: number, { priority, rating }: CostModel): number[] {
  const byPriority = [...Array(n).keys()].sort((a, b) => priority[b] - priority[a]);
  const byRating = (a: number, b: number) => rating[b] - rating[a];
  const slots = byPriority.slice(0, singlesSlots).sort(byRating);
  const rest = byPriority.slice(singlesSlots).sort(byRating);
  for (let i = 0; i < rest.length; i += 4) slots.push(rest[i], rest[i + 3], rest[i + 1], rest[i + 2]);
  return slots;
}

// Simulated annealing over player swaps. slots[k] is an index into the players array.
function anneal(start: number[], layout: Slot[], model: CostModel, random: Random, iterations: number) {
  const slots = start.slice();
  const n = slots.length;
  const courtOf = new Int32Array(n);
  layout.forEach((court, c) => {
    for (let k = 0; k < court.size; k++) courtOf[court.start + k] = c;
  });
  const costs = layout.map((court) => model.court(slots, court));
  let total = costs.reduce((a, b) => a + b, 0);
  let best = slots.slice();
  let bestTotal = total;
  let temperature = 2;
  const cooling = (0.01 / temperature) ** (1 / Math.max(1, iterations));

  for (let it = 0; it < iterations; it++, temperature *= cooling) {
    const i = Math.floor(random() * n);
    const j = Math.floor(random() * n);
    const ci = courtOf[i];
    const cj = courtOf[j];
    if (ci === cj) {
      // Within a court, only swapping across the net in doubles changes anything.
      const { type, start: first } = layout[ci];
      if (type === 'singles' || (i - first) >> 1 === (j - first) >> 1) continue;
    }
    [slots[i], slots[j]] = [slots[j], slots[i]];
    const newI = model.court(slots, layout[ci]);
    const newJ = ci === cj ? 0 : model.court(slots, layout[cj]);
    const delta = newI + newJ - costs[ci] - (ci === cj ? 0 : costs[cj]);
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      costs[ci] = newI;
      if (ci !== cj) costs[cj] = newJ;
      total += delta;
      if (total < bestTotal - 1e-9) {
        bestTotal = total;
        best = slots.slice();
      }
    } else {
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
  }
  return { slots: best, total: bestTotal };
}

// Zero within the margin, then growing faster than linearly: one lopsided match costs more
// than two slightly uneven ones. `points` is how far past the margin, in rating points.
function curve(points: number): number {
  if (points <= 0) return 0;
  const x = points / 100;
  return x + (x * x) / 2;
}

function freshness(lastDay: number | undefined, today: number, w: Weights): number {
  if (lastDay === undefined) return 1;
  return Math.min(1, Math.max(0, (today - lastDay) / (7 * w.freshWeeks)));
}

// Everything the cost function needs, precomputed per player and per pair so that scoring a
// court during the search is cheap.
function costModel(players: Player[], singlesSlots: number, { evening, history, today, w }: Context): CostModel {
  const n = players.length;
  const stats = players.map((p) => statsFor(evening, p.id));
  const shares = singlesShares(players, singlesSlots, w);
  const rating = players.map((p) => p.rating);
  const energy = players.map((p) => w.energy[p.energy ?? 'normal']);
  const down = energy.map((e, i) => e * (1 + w.debt * stats[i].oppDebt));
  const carry = energy.map((e, i) => e * (1 + w.debt * stats[i].partnerDebt));
  const gapCost = stats.map((s) => w.bigGap * (1 + 2 * s.bigGaps));
  // How many singles rounds a player is owed, counting this round's fair share.
  const priority = stats.map((s, i) => s.singlesDue + shares[i] - s.singles);
  const inSingles = players.map((p, i) => w.type * (0.5 - priority[i]) + (p.pref === 'doubles' ? w.prefersDoubles : 0));

  const opp = new Float64Array(n * n);
  const partner = new Float64Array(n * n);
  const fixed = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = players[i];
      const b = players[j];
      const key = pairKey(a.id, b.id);
      const tonight = evening.met[key] ?? { opp: 0, partner: 0 };
      const last = history.met[key] ?? {};
      const untested = isProvisional(a) && isProvisional(b) ? w.provisional : 0;
      opp[i * n + j] = opp[j * n + i] = w.repeatOpp * tonight.opp + w.repeatCross * tonight.partner
        - w.fresh * freshness(last.opp, today, w) + untested;
      if (a.partnerId === b.id || b.partnerId === a.id) {
        // A fixed pair playing together is never a repeat: it's the point.
        const share = (a.partnerId === b.id ? a.partnerShare : b.partnerShare) ?? 0.5;
        const { both, together } = evening.fixed[key] ?? { both: 0, together: 0 };
        const behind = share * (both + 1) - together;
        partner[i * n + j] = partner[j * n + i] = untested - w.fixedPair * Math.min(1, Math.max(0, behind));
        fixed[i * n + j] = fixed[j * n + i] = 1;
      } else {
        partner[i * n + j] = partner[j * n + i] = w.repeatPartner * tonight.partner + w.repeatCross * tonight.opp
          - w.fresh * freshness(last.partner, today, w) + untested;
      }
    }
  }

  function singles(a: number, b: number): number {
    const hi = rating[a] >= rating[b] ? a : b;
    const gap = Math.abs(rating[a] - rating[b]);
    return down[hi] * curve(gap - w.margin) + w.crushing * curve(gap - w.crushingGap)
      + inSingles[a] + inSingles[b] + opp[a * n + b];
  }

  function pairing(p: number, q: number): number {
    const cost = partner[p * n + q];
    if (fixed[p * n + q]) return cost;
    const hi = rating[p] >= rating[q] ? p : q;
    const gap = Math.abs(rating[p] - rating[q]);
    return cost
      + w.partner * carry[hi] * curve(gap - w.partnerMargin)
      + w.partnerUp * curve(gap - w.partnerUpLimit)
      + (gap > w.bigGapPoints ? gapCost[p] + gapCost[q] : 0);
  }

  function doubles(a1: number, a2: number, b1: number, b2: number): number {
    const ta = (rating[a1] + rating[a2]) / 2;
    const tb = (rating[b1] + rating[b2]) / 2;
    const favourite = ta >= tb ? down[a1] + down[a2] : down[b1] + down[b2];
    return w.balance * (favourite / 2) * curve(Math.abs(ta - tb) - w.balanceMargin)
      + w.opposition * (
        down[a1] * curve(rating[a1] - tb - w.margin) + down[a2] * curve(rating[a2] - tb - w.margin)
        + down[b1] * curve(rating[b1] - ta - w.margin) + down[b2] * curve(rating[b2] - ta - w.margin))
      + pairing(a1, a2) + pairing(b1, b2)
      + opp[a1 * n + b1] + opp[a1 * n + b2] + opp[a2 * n + b1] + opp[a2 * n + b2];
  }

  return {
    priority,
    rating,
    court(slots, { type, start }) {
      return type === 'singles'
        ? singles(slots[start], slots[start + 1])
        : doubles(slots[start], slots[start + 1], slots[start + 2], slots[start + 3]);
    },
  };
}

function forEachPair(court: Court, fn: (a: string, b: string, relation: 'opp' | 'partner') => void) {
  const [sideA, sideB] = court.sides;
  for (const side of court.sides) if (side.length === 2) fn(side[0], side[1], 'partner');
  for (const a of sideA) for (const b of sideB) fn(a, b, 'opp');
}

/**
 * Updates the evening's bookkeeping after a round. `players` is the list that went into
 * planRound. Returns a new evening; the input is not changed.
 */
export function recordRound(
  evening: Evening,
  plan: Pick<Plan, 'courts' | 'resting'>,
  players: Player[],
  weights?: WeightOverrides,
): Evening {
  const w = withDefaults(weights);
  const byId = new Map(players.map((p) => [p.id, p]));
  const player = (id: string) => {
    const p = byId.get(id);
    if (!p) throw new Error(`Player ${id} is in the plan but not in the players list`);
    return p;
  };
  const next: Evening = {
    round: evening.round + 1,
    players: { ...evening.players },
    met: { ...evening.met },
    fixed: { ...evening.fixed },
  };
  const update = (id: string, change: (s: PlayerStats) => void) => {
    const s = { ...(next.players[id] ?? statsFor(evening, id)) };
    change(s);
    next.players[id] = s;
  };

  for (const id of plan.resting) {
    update(id, (s) => {
      s.rests += 1;
      s.restedLast = true;
      s.oppDebt *= w.debtDecay;
      s.partnerDebt *= w.debtDecay;
    });
  }

  const onCourt = plan.courts.flatMap((c) => c.sides.flat()).map(player);
  const singlesSlots = 2 * plan.courts.filter((c) => c.type === 'singles').length;
  const shares = singlesShares(onCourt, singlesSlots, w);
  onCourt.forEach((p, i) => update(p.id, (s) => {
    s.played += 1;
    s.restedLast = false;
    s.singlesDue += shares[i];
  }));

  const partnerOf = new Map<string, string>();
  for (const court of plan.courts) {
    const strength = court.sides.map((side) => side.reduce((sum, id) => sum + player(id).rating, 0) / side.length);
    court.sides.forEach((side, s) => {
      const mine = strength[s];
      const theirs = strength[1 - s];
      for (const id of side) {
        const p = player(id);
        const versus = Math.max(0, p.rating - theirs - w.margin) / 100;
        const playedDown = court.type === 'singles'
          ? versus
          : Math.max(Math.max(0, mine - theirs - w.balanceMargin) / 100, versus / 2);
        const mateId = side.find((other) => other !== id);
        const mate = mateId === undefined ? undefined : player(mateId);
        const unfixedMate = mate && p.partnerId !== mate.id && mate.partnerId !== id ? mate : undefined;
        const carried = unfixedMate ? Math.max(0, p.rating - unfixedMate.rating - w.partnerMargin) / 100 : 0;
        const bigGap = unfixedMate && Math.abs(p.rating - unfixedMate.rating) > w.bigGapPoints ? 1 : 0;
        if (mate) partnerOf.set(id, mate.id);
        // Easy-night players don't build up debt: playing down is what they signed up for.
        const easy = p.energy === 'easy';
        update(id, (st) => {
          if (court.type === 'singles') st.singles += 1;
          st.oppDebt = st.oppDebt * w.debtDecay + (easy ? 0 : playedDown);
          st.partnerDebt = st.partnerDebt * w.debtDecay + (easy ? 0 : carried);
          st.bigGaps += bigGap;
        });
      }
    });
    forEachPair(court, (a, b, relation) => {
      const key = pairKey(a, b);
      const met = next.met[key] ?? { opp: 0, partner: 0 };
      next.met[key] = { ...met, [relation]: met[relation] + 1 };
    });
  }

  const playing = new Set(onCourt.map((p) => p.id));
  const counted = new Set<string>();
  for (const p of players) {
    if (!p.partnerId || !playing.has(p.id) || !playing.has(p.partnerId)) continue;
    const key = pairKey(p.id, p.partnerId);
    if (counted.has(key)) continue;
    counted.add(key);
    const { both, together } = next.fixed[key] ?? { both: 0, together: 0 };
    next.fixed[key] = { both: both + 1, together: together + (partnerOf.get(p.id) === p.partnerId ? 1 : 0) };
  }
  return next;
}

/** Remembers, across evenings, the day each pair last met as opponents and as partners. */
export function recordHistory(history: History, plan: Pick<Plan, 'courts'>, today: number): History {
  const met = { ...history.met };
  for (const court of plan.courts) {
    forEachPair(court, (a, b, relation) => {
      const key = pairKey(a, b);
      met[key] = { ...met[key], [relation]: today };
    });
  }
  return { met };
}
