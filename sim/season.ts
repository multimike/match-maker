// Plays a simulated season: every evening, every round, the engine plans, the simulated
// players play (winners drawn from true levels), and ratings and history are updated, the
// same loop the app will run.

import {
  newEvening,
  newHistory,
  planRound,
  recordHistory,
  recordRound,
  type Court,
  type Plan,
  type Player,
  type WeightOverrides,
} from '../src/engine/engine.ts';
import { seededRandom, type Random } from '../src/engine/random.ts';
import { RATING, expectedScore, rateRound, startingRating, type Ratings } from '../src/engine/rating.ts';
import { makeClub, makeSchedule, type Member, type Schedule } from './club.ts';
import { Recorder } from './metrics.ts';

/**
 * Where ratings start: all equal, from the member's group, from the group with the organiser
 * correcting the most obviously misplaced players, or `perfect`: the engine sees true levels
 * (not possible in real life; it shows the ceiling).
 */
export type Seeding = 'equal' | 'group' | 'nudged' | 'perfect';

export interface SeasonSpec {
  sessions: { members: Member[]; courts: number }[];
  schedule: Schedule;
  rounds: number;
  seeding: Seeding;
  random: Random;
  weights?: WeightOverrides;
  /** Rating update, replaceable to compare rating systems. */
  rate?: typeof rateRound;
  /** Plays a court and returns the winning side; replaceable to simulate scores. */
  play?: typeof winner;
  onRound?: (evening: number, round: number, plan: Plan, ratings: Ratings) => void;
}

export const timings: number[] = [];

function initialRatings(members: Member[], seeding: Seeding): Ratings {
  const ratings: Ratings = {};
  for (const m of members) {
    const rating = seeding === 'perfect' ? m.level : seeding === 'equal' ? RATING.fallback : startingRating(m.group);
    ratings[m.id] = { rating, matches: seeding === 'perfect' ? 1000 : 0 };
  }
  if (seeding === 'nudged') {
    // The organiser corrects the most obviously misplaced players, about one in seven.
    const misplaced = [...members].sort((a, b) =>
      Math.abs(b.level - ratings[b.id].rating) - Math.abs(a.level - ratings[a.id].rating));
    for (const m of misplaced.slice(0, Math.round(members.length / 7))) {
      ratings[m.id].rating = Math.round(m.level / 50) * 50;
    }
  }
  return ratings;
}

export function winner(court: Court, level: (id: string) => number, random: Random): 0 | 1 {
  const [a, b] = court.sides.map((side) => side.reduce((sum, id) => sum + level(id), 0) / side.length);
  return random() < expectedScore(a, b) ? 0 : 1;
}

export function runSeason({ sessions, schedule, rounds, seeding, random, weights, rate = rateRound, play = winner, onRound }: SeasonSpec): Recorder {
  const members = sessions.flatMap((s) => s.members);
  const levels = new Map(members.map((m) => [m.id, m.level]));
  const level = (id: string) => levels.get(id) ?? 0;
  const recorder = new Recorder(members);
  const state = sessions.map((s) => ({
    courts: s.courts,
    byId: new Map(s.members.map((m) => [m.id, m])),
    ratings: initialRatings(s.members, seeding),
    history: newHistory(),
  }));

  schedule.forEach((attendees, e) => {
    const today = 7 * e;
    recorder.startEvening();
    for (const session of state) {
      const tonight = attendees.filter((a) => session.byId.has(a.id));
      let evening = newEvening();
      for (let r = 0; r < rounds; r++) {
        const players: Player[] = tonight
          .filter((a) => a.arrives <= r && r < a.leaves)
          .map((a) => {
            const m = session.byId.get(a.id)!;
            const { rating, matches } = session.ratings[a.id];
            return {
              id: a.id, rating, matches, pref: m.pref, energy: a.energy, restOk: a.restOk,
              partnerId: m.partnerId, partnerShare: m.partnerShare, skip: a.skips[r],
            };
          });
        const started = performance.now();
        const plan = planRound({ players, courts: session.courts, evening, history: session.history, today, random, weights });
        timings.push(performance.now() - started);
        recorder.round(plan, players);
        onRound?.(e, r, plan, session.ratings);
        const winners = plan.courts.map((court) => play(court, level, random));
        evening = recordRound(evening, plan, players, weights);
        session.history = recordHistory(session.history, plan, today);
        if (seeding !== 'perfect') session.ratings = rate(session.ratings, plan, winners);
      }
    }
    recorder.endEvening(state.length === 1 ? state[0].ratings : undefined);
  });
  return recorder;
}

/**
 * Season s of a club with `size` members. The same club, evenings and engine randomness for
 * every setup within a season, so that differences come from the setup, not from luck.
 */
export function season(size: number, s: number, { seed = 1, evenings = 20, rounds = 8 } = {}) {
  const base = seed * 1000 + s;
  const club = makeClub(size, seededRandom(base));
  return {
    club,
    schedule: makeSchedule(club, evenings, rounds, seededRandom(base + 100)),
    random: () => seededRandom(base + 200),
  };
}
