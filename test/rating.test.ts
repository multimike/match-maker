import { expect, test } from 'vitest';
import type { Court } from '../src/engine/engine.ts';
import { RATING, expectedScore, rateRound, startingRating, type Ratings } from '../src/engine/rating.ts';

const singles = (a: string, b: string): { courts: Court[] } => ({ courts: [{ type: 'singles', sides: [[a], [b]] }] });

test('expected score: even at equal ratings, about 64% for 100 points stronger', () => {
  expect(expectedScore(1500, 1500)).toBe(0.5);
  expect(expectedScore(1600, 1500)).toBeCloseTo(0.64, 2);
  expect(expectedScore(1600, 1500) + expectedScore(1500, 1600)).toBeCloseTo(1, 10);
});

test('starting ratings come from the usual group', () => {
  expect(startingRating(1)).toBe(RATING.start[1]);
  expect(startingRating(2)).toBe(RATING.start[2]);
  expect(startingRating()).toBe(RATING.fallback);
});

test('singles: the winner gains what the loser loses, and an upset moves more', () => {
  const ratings: Ratings = { a: { rating: 1500, matches: 30 }, b: { rating: 1600, matches: 30 } };
  const upset = rateRound(ratings, singles('a', 'b'), [0]);
  const expected = rateRound(ratings, singles('a', 'b'), [1]);
  expect(upset.a.rating - 1500).toBeCloseTo(1600 - upset.b.rating, 10);
  expect(upset.a.rating - 1500).toBeGreaterThan(expected.b.rating - 1600);
  expect(upset.a.matches).toBe(31);
});

test('provisional players move faster', () => {
  const ratings: Ratings = { fresh: { rating: 1500, matches: 0 }, settled: { rating: 1500, matches: 50 } };
  const next = rateRound(ratings, singles('fresh', 'settled'), [0]);
  expect(next.fresh.rating - 1500).toBeGreaterThan(1500 - next.settled.rating);
});

test('doubles: both partners move, by less than in singles', () => {
  const ratings: Ratings = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { rating: 1500, matches: 30 }]));
  const next = rateRound(ratings, { courts: [{ type: 'doubles', sides: [['a', 'b'], ['c', 'd']] }] }, [0]);
  expect(next.a.rating - 1500).toBeCloseTo(RATING.k * RATING.doublesFactor * 0.5, 10);
  expect(next.b.rating).toBe(next.a.rating);
  expect(next.c.rating).toBeCloseTo(1500 - (next.a.rating - 1500), 10);
});

test('a court without a result changes nothing', () => {
  const ratings: Ratings = { a: { rating: 1500, matches: 3 }, b: { rating: 1500, matches: 3 } };
  expect(rateRound(ratings, singles('a', 'b'), [null])).toEqual(ratings);
});
