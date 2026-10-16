// What players' phones see of tonight: a small projection of the open evening that the
// organiser's device writes next to the full data. Every phone follows it live, so it stays
// small: names and ratings come from the members document, and none of the engine's
// bookkeeping is in here.

import type { Court, Energy } from '../engine/engine.ts';
import { isHere, latestRound, openSession, type AppState, type CourtResult, type RoundStatus, type Timer } from './model.ts';

export interface LiveCheckIn {
  energy: Energy;
  restOk: boolean;
  skip: boolean;
  /** Checked in and not gone home. */
  here: boolean;
  /** Rating at the first check-in tonight, for tonight's change. */
  startRating: number;
}

export interface LiveRound {
  id: string;
  number: number;
  status: RoundStatus;
  courts: Court[];
  resting: string[];
  timer: Timer;
  results: CourtResult[];
  /** After the round is saved: each player's rating change from it. */
  changes?: Record<string, number>;
}

export interface LiveSession {
  id: string;
  date: string;
  courts: number;
  roundMinutes: number;
  checkIns: Record<string, LiveCheckIn>;
  round?: LiveRound;
}

export interface LiveView {
  session: LiveSession | null;
}

export function liveView(state: AppState): LiveView {
  const session = openSession(state);
  if (!session) return { session: null };
  const ratings = new Map(state.members.map((m) => [m.id, m.rating]));
  const round = latestRound(session);
  return {
    session: {
      id: session.id,
      date: session.date,
      courts: session.courts,
      roundMinutes: session.roundMinutes,
      checkIns: Object.fromEntries(Object.entries(session.checkIns).map(([id, c]) => [id, {
        energy: c.energy,
        restOk: c.restOk,
        skip: c.skip,
        here: isHere(c),
        startRating: c.startRating,
      }])),
      round: round && {
        id: round.id,
        number: round.number,
        status: round.status,
        courts: round.courts,
        resting: round.resting,
        timer: round.timer,
        results: round.results,
        changes: round.status === 'done' && round.ratingsBefore
          ? Object.fromEntries(Object.entries(round.ratingsBefore).map(([id, before]) => [id, (ratings.get(id) ?? before.rating) - before.rating]))
          : undefined,
      },
    },
  };
}
