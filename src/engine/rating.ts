// Elo-style ratings on one scale shared by both groups. A rating is a number around 1500;
// a side 100 points stronger is expected to win about 64% of the time, 200 points about 76%.

import type { Court } from './engine.ts';

export interface Rated {
  rating: number;
  /** Rated matches played. */
  matches: number;
}

export type Ratings = Record<string, Rated>;

/** The winning side (0 or 1) on a court, or null when no result was entered. */
export type Winner = 0 | 1 | null;

export const RATING = {
  // Starting point from "which group do you usually play in?". No manual pre-ranking.
  start: { 1: 1600, 2: 1400 } as Record<number, number>,
  fallback: 1500,
  k: 24, // adjustment size once a rating has settled
  provisionalK: 64, // bigger steps while provisional, so new players find their level fast
  provisionalMatches: 10,
  doublesFactor: 0.75, // a doubles result says less about each partner than a singles result
};

export function startingRating(group?: number): number {
  return (group !== undefined ? RATING.start[group] : undefined) ?? RATING.fallback;
}

export function isProvisional(player: { matches?: number }): boolean {
  return (player.matches ?? 0) < RATING.provisionalMatches;
}

/** Chance that a side rated `rating` beats a side rated `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** A doubles side's strength is the average of the two partners. */
export function sideRating(ratings: Ratings, side: readonly string[]): number {
  return side.reduce((sum, id) => sum + ratings[id].rating, 0) / side.length;
}

/**
 * Applies one round of results, winners[i] being the result on courts[i].
 * Returns new ratings; the input is not changed.
 */
export function rateRound(ratings: Ratings, plan: { courts: readonly Court[] }, winners: readonly Winner[]): Ratings {
  const next = { ...ratings };
  plan.courts.forEach((court, i) => {
    const winner = winners[i];
    if (winner !== 0 && winner !== 1) return;
    const expected = expectedScore(sideRating(ratings, court.sides[0]), sideRating(ratings, court.sides[1]));
    const factor = court.type === 'doubles' ? RATING.doublesFactor : 1;
    court.sides.forEach((side, s) => {
      const score = winner === s ? 1 : 0;
      const sideExpected = s === 0 ? expected : 1 - expected;
      for (const id of side) {
        const player = ratings[id];
        const k = (isProvisional(player) ? RATING.provisionalK : RATING.k) * factor;
        next[id] = { ...player, rating: player.rating + k * (score - sideExpected), matches: player.matches + 1 };
      }
    });
  });
  return next;
}
