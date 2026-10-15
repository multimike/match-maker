// Measures how well a simulated season served each member. Everything here uses true levels:
// what players would actually feel on court, whatever the ratings said at the time.

import { pairKey, type Court, type Plan, type Player, type Pref } from '../src/engine/engine.ts';
import type { Ratings } from '../src/engine/rating.ts';
import type { Member } from './club.ts';

const EQUAL = 50; // "equal or better": an opponent at most this far below you
const CLEAR_FAVOURITE = 100; // your side ~64% or more likely to win
const LOPSIDED = 200; // ~76% or more
const PARTNER_BELOW = 75; // a partner counts as "similar or slightly better" from this far below...
const PARTNER_ABOVE = 150; // ...to this far above you
const BIG_GAP = 200; // "very different" partners
const COMPATIBLE = 150; // close enough in level to be worth meeting now and then

export interface Tally {
  rounds: number;
  rests: number;
  matches: number;
  /** Equal or better opposition, and your side not a clear favourite. */
  challenging: number;
  easy: number;
  lopsided: number;
  singles: number;
  doubles: number;
  partnerGood: number;
  bigGaps: number;
  /** People met (partners and opponents), counting repeats. */
  meetings: number;
  /** Different people met. */
  distinct: number;
  /** Partnered someone already partnered earlier the same night. */
  partnerRepeats: number;
  /** 1 if the player met (as partner or opponent) one of the club's top quarter that night. */
  metTop: number;
}

const emptyTally = (): Tally => ({
  rounds: 0, rests: 0, matches: 0, challenging: 0, easy: 0, lopsided: 0,
  singles: 0, doubles: 0, partnerGood: 0, bigGaps: 0, meetings: 0, distinct: 0, partnerRepeats: 0, metTop: 0,
});

export class Recorder {
  readonly members: Member[];
  readonly byId: Map<string, Member>;
  /** Per evening, per member. */
  readonly evenings: Map<string, Tally>[] = [];
  /** Per evening: rank correlation between ratings and true levels (combined nights only). */
  readonly correlation: (number | undefined)[] = [];
  /** Per evening: typical rating error in points (root mean square, combined nights only). */
  readonly error: (number | undefined)[] = [];
  readonly timings: number[] = [];
  /** Pairs that met at least once this season. */
  readonly met = new Set<string>();
  fixed = { both: 0, together: 0 };
  courts = { all: 0, mixed: 0 };
  /** Longest run of rests in a row that includes a rest the player didn't ask for. */
  maxRestStreak = 0;
  private readonly top: Set<string>;
  private tonight = new Map<string, Map<string, number>>();
  private partners = new Map<string, Set<string>>();
  private streak = new Map<string, number>();

  constructor(members: Member[]) {
    this.members = members;
    this.byId = new Map(members.map((m) => [m.id, m]));
    const byLevel = [...members].sort((a, b) => b.level - a.level);
    this.top = new Set(byLevel.slice(0, Math.ceil(members.length / 4)).map((m) => m.id));
  }

  private member(id: string): Member {
    const m = this.byId.get(id);
    if (!m) throw new Error(`Unknown member ${id}`);
    return m;
  }

  private tally(id: string): Tally {
    const evening = this.evenings[this.evenings.length - 1];
    let t = evening.get(id);
    if (!t) evening.set(id, (t = emptyTally()));
    return t;
  }

  startEvening(): void {
    this.evenings.push(new Map());
    this.tonight = new Map();
    this.partners = new Map();
    this.streak = new Map();
  }

  round(plan: Plan, players: Player[]): void {
    const skipped = new Set(players.filter((p) => p.skip).map((p) => p.id));
    for (const p of players) this.tally(p.id).rounds += 1;
    for (const id of plan.resting) {
      this.tally(id).rests += 1;
      const streak = (this.streak.get(id) ?? 0) + 1;
      this.streak.set(id, streak);
      if (!skipped.has(id)) this.maxRestStreak = Math.max(this.maxRestStreak, streak);
    }
    const sideOf = new Map<string, string[]>();
    for (const court of plan.courts) {
      this.court(court);
      for (const side of court.sides) for (const id of side) sideOf.set(id, side);
    }
    for (const [id, side] of sideOf) {
      const partnerId = this.member(id).partnerId;
      if (!partnerId || id > partnerId || !sideOf.has(partnerId)) continue;
      this.fixed.both += 1;
      if (side.includes(partnerId)) this.fixed.together += 1;
    }
  }

  private court(court: Court): void {
    const level = (id: string) => this.member(id).level;
    const strength = court.sides.map((side) => side.reduce((sum, id) => sum + level(id), 0) / side.length);
    const ids = court.sides.flat();
    this.courts.all += 1;
    if (new Set(ids.map((id) => this.member(id).group)).size > 1) this.courts.mixed += 1;

    court.sides.forEach((side, s) => {
      const margin = strength[s] - strength[1 - s]; // > 0: my side is stronger
      const best = Math.max(...court.sides[1 - s].map(level));
      for (const id of side) {
        const t = this.tally(id);
        const me = level(id);
        this.streak.set(id, 0);
        t.matches += 1;
        if (margin <= EQUAL && best >= me - EQUAL) t.challenging += 1;
        if (margin > CLEAR_FAVOURITE) t.easy += 1;
        if (Math.abs(margin) > LOPSIDED) t.lopsided += 1;
        if (court.type === 'singles') {
          t.singles += 1;
        } else {
          t.doubles += 1;
          const mate = side.find((other) => other !== id) ?? id;
          const partners = this.partners.get(id) ?? new Set<string>();
          if (partners.has(mate)) t.partnerRepeats += 1;
          this.partners.set(id, partners.add(mate));
          const gap = level(mate) - me;
          if (gap >= -PARTNER_BELOW && gap <= PARTNER_ABOVE) t.partnerGood += 1;
          if (Math.abs(gap) > BIG_GAP) t.bigGaps += 1;
        }
      }
    });

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        this.meet(ids[i], ids[j]);
        this.meet(ids[j], ids[i]);
        this.met.add(pairKey(ids[i], ids[j]));
      }
    }
  }

  private meet(a: string, b: string): void {
    const others = this.tonight.get(a) ?? new Map<string, number>();
    others.set(b, (others.get(b) ?? 0) + 1);
    this.tonight.set(a, others);
  }

  endEvening(ratings?: Ratings): void {
    for (const [id, others] of this.tonight) {
      const t = this.tally(id);
      t.distinct = others.size;
      t.meetings = [...others.values()].reduce((a, b) => a + b, 0);
      t.metTop = [...others.keys()].some((other) => this.top.has(other)) ? 1 : 0;
    }
    this.correlation.push(ratings && spearman(
      this.members.map((m) => ratings[m.id].rating),
      this.members.map((m) => m.level),
    ));
    // Errors relative to the average offset: only differences between players matter.
    const offsets = ratings && this.members.map((m) => ratings[m.id].rating - m.level);
    this.error.push(offsets && Math.sqrt(mean(offsets.map((d) => (d - mean(offsets)) ** 2))));
  }
}

export interface Summary {
  playersPerNight: number;
  challenging: { all: number; worst10: number; topOfGroup2: number; bottomOfGroup1: number; top3: number; bottom3: number };
  easy: number;
  lopsided: number;
  partnerGood: number;
  bigGapsPerNight: number;
  singlesShare: Record<Pref, number>;
  restsPerNight: number;
  maxRestStreak: number;
  repeatsPerNight: number;
  partnerRepeatsPerNight: number;
  distinctPerNight: number;
  /** Share of nights meeting one of the club's top quarter, as partner or opponent. */
  metTop: { topOfGroup2: number; bottomOfGroup1: number };
  /** Share of level-compatible pairs who met at least once during the season. */
  coverage: number;
  fixedTogether: number;
  mixedCourts: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Summarises evenings [from, to) of a season. */
export function summarize(recorder: Recorder, from: number, to = recorder.evenings.length): Summary {
  const totals = new Map<string, Tally>();
  let playerEvenings = 0;
  for (const evening of recorder.evenings.slice(from, to)) {
    for (const [id, t] of evening) {
      playerEvenings += 1;
      const sum = totals.get(id) ?? emptyTally();
      for (const key of Object.keys(t) as (keyof Tally)[]) sum[key] += t[key];
      totals.set(id, sum);
    }
  }
  const members = recorder.members.filter((m) => (totals.get(m.id)?.matches ?? 0) > 0);
  const total = (key: keyof Tally) => [...totals.values()].reduce((sum, t) => sum + t[key], 0);
  const challengeOf = (m: Member) => {
    const t = totals.get(m.id) ?? emptyTally();
    return ratio(t.challenging, t.matches);
  };
  const challenge = (subset: Member[]) => mean(subset.map(challengeOf));
  const byLevel = (group?: 1 | 2) => members.filter((m) => !group || m.group === group).sort((a, b) => b.level - a.level);
  const quarter = (list: Member[]) => Math.max(1, Math.round(list.length / 4));
  const shares = members.map(challengeOf).sort((a, b) => a - b);
  const nightsMeetingTop = (subset: Member[]) => mean(subset.map((m) => {
    const nights = recorder.evenings.slice(from, to).map((evening) => evening.get(m.id)).filter((t) => t && t.matches > 0);
    return ratio(nights.filter((t) => t!.metTop).length, nights.length);
  }));
  const singlesShare = (pref: Pref) => mean(members.filter((m) => m.pref === pref).map((m) => {
    const t = totals.get(m.id) ?? emptyTally();
    return ratio(t.singles, t.matches);
  }));

  let compatible = 0;
  let compatibleMet = 0;
  const all = recorder.members;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (Math.abs(all[i].level - all[j].level) > COMPATIBLE) continue;
      compatible += 1;
      if (recorder.met.has(pairKey(all[i].id, all[j].id))) compatibleMet += 1;
    }
  }

  const g2 = byLevel(2);
  const g1 = byLevel(1);
  const everyone = byLevel();
  const topOfGroup2 = g2.slice(0, quarter(g2));
  const bottomOfGroup1 = g1.slice(-quarter(g1));
  return {
    playersPerNight: ratio(playerEvenings, Math.max(1, Math.min(to, recorder.evenings.length) - from)),
    challenging: {
      all: challenge(members),
      worst10: shares[Math.floor(shares.length / 10)] ?? 0,
      topOfGroup2: challenge(topOfGroup2),
      bottomOfGroup1: challenge(bottomOfGroup1),
      top3: challenge(everyone.slice(0, 3)),
      bottom3: challenge(everyone.slice(-3)),
    },
    easy: ratio(total('easy'), total('matches')),
    lopsided: ratio(total('lopsided'), total('matches')),
    partnerGood: ratio(total('partnerGood'), total('doubles')),
    bigGapsPerNight: ratio(total('bigGaps'), playerEvenings),
    singlesShare: { singles: singlesShare('singles'), either: singlesShare('either'), doubles: singlesShare('doubles') },
    restsPerNight: ratio(total('rests'), playerEvenings),
    maxRestStreak: recorder.maxRestStreak,
    repeatsPerNight: ratio(total('meetings') - total('distinct'), playerEvenings),
    partnerRepeatsPerNight: ratio(total('partnerRepeats'), playerEvenings),
    distinctPerNight: ratio(total('distinct'), playerEvenings),
    metTop: { topOfGroup2: nightsMeetingTop(topOfGroup2), bottomOfGroup1: nightsMeetingTop(bottomOfGroup1) },
    coverage: ratio(compatibleMet, compatible),
    fixedTogether: ratio(recorder.fixed.together, recorder.fixed.both),
    mixedCourts: ratio(recorder.courts.mixed, recorder.courts.all),
  };
}

/** Per evening: the average player's share of challenging matches, and rating accuracy. */
export function timeline(recorder: Recorder): { challenging: number; correlation: number; error: number }[] {
  return recorder.evenings.map((evening, e) => ({
    challenging: mean([...evening.values()].filter((t) => t.matches > 0).map((t) => t.challenging / t.matches)),
    correlation: recorder.correlation[e] ?? 0,
    error: recorder.error[e] ?? 0,
  }));
}

/** Averages numbers field by field across seasons. */
export function average<T>(items: T[]): T {
  const first = items[0];
  if (typeof first === 'number') return mean(items as number[]) as T;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(first as object)) {
    result[key] = average(items.map((item) => (item as Record<string, unknown>)[key]));
  }
  return (Array.isArray(first) ? Object.values(result) : result) as T;
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const result = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) result[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return result;
}

/** Rank correlation: 1 when the ratings put everyone in exactly the right order. */
export function spearman(x: number[], y: number[]): number {
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
