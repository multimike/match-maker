// Result entry: the buzzer rule from docs/design.md. The side ahead at the buzzer wins; a level
// score is settled by one deciding point, so there are no draws.

import type { Court } from '../engine/engine.ts';
import type { Rated, Winner } from '../engine/rating.ts';
import { MAX_SCORE, type CourtResult } from './model.ts';

export function validScore(points: number): boolean {
  return Number.isInteger(points) && points >= 0 && points <= MAX_SCORE;
}

/** The winner follows from the score; null while it's level (a deciding point is needed). */
export function winnerFromScore([a, b]: [number, number]): Winner {
  return a === b ? null : a > b ? 0 : 1;
}

/**
 * The result for a score at the buzzer. A level score needs the side that won the deciding
 * point, which is added to the score; without it, there is no winner yet.
 */
export function resultFromScore(score: [number, number], decider: Winner = null): CourtResult {
  const winner = winnerFromScore(score);
  if (winner !== null) return { winner, score };
  if (decider === null) return { winner: null, score };
  const settled: [number, number] = [...score];
  settled[decider] += 1;
  return { winner: decider, score: settled };
}

/**
 * Tapping a side: it wins, or stops being the winner if it already was. With a level score the
 * tap is the deciding point; a score that says otherwise is dropped.
 */
export function pickWinner(current: CourtResult, side: 0 | 1): CourtResult {
  if (current.winner === side) return { winner: null };
  if (current.score && winnerFromScore(current.score) === null) return resultFromScore(current.score, side);
  return { winner: side };
}

function strength(ratings: Record<string, Rated>, side: readonly string[]): number {
  return side.reduce((sum, id) => sum + (ratings[id]?.rating ?? 0), 0) / side.length;
}

/** The weaker side won by more than a coin flip's worth of rating (50 points). */
export function isUpset(court: Court, ratings: Record<string, Rated>, winner: Winner): boolean {
  if (winner === null) return false;
  return strength(ratings, court.sides[1 - winner]) - strength(ratings, court.sides[winner]) > 50;
}
