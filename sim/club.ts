// A made-up club for the simulation. Every member has a hidden "true level" on the rating
// scale. The engine never sees it, only the ratings that the simulated results produce.

import type { Energy, Pref } from '../src/engine/engine.ts';
import { gaussian, type Random } from '../src/engine/random.ts';

export interface Member {
  id: string;
  name: string;
  /** The training group the coaches put them in today. */
  group: 1 | 2;
  /** True level on the rating scale. */
  level: number;
  pref: Pref;
  /** Chance of coming on a given evening. */
  attendance: number;
  partnerId?: string;
  partnerShare?: number;
}

/** Someone who comes on a given evening, and how they feel. */
export interface Attendee {
  id: string;
  energy: Energy;
  restOk: boolean;
  /** First round played (late arrival) and the round they leave before. */
  arrives: number;
  leaves: number;
  /** "Skip next round", per round. */
  skips: boolean[];
}

/** Who comes on each evening of a season. */
export type Schedule = Attendee[][];

const NAMES = [
  'Anna', 'Erik', 'Sara', 'Johan', 'Emma', 'Lars', 'Maria', 'Karl', 'Elin', 'Oskar', 'Linnea', 'Gustav',
  'Ida', 'Viktor', 'Hanna', 'Axel', 'Julia', 'Filip', 'Klara', 'Anton', 'Maja', 'Hugo', 'Ella', 'Lucas',
  'Wilma', 'Elias', 'Alva', 'Liam', 'Ebba', 'Noah', 'Astrid', 'Leo', 'Saga', 'Isak', 'Freja', 'Melvin',
  'Agnes', 'Albin', 'Tilda', 'Arvid', 'Stina', 'Nils', 'Vera', 'Olle', 'Signe', 'Ludvig', 'Selma', 'Ture',
];

export function makeClub(size: number, random: Random, fixedPairs = Math.round(size / 12)): Member[] {
  const levels = Array.from({ length: size }, () => Math.round(gaussian(random, 1500, 180)));
  // Coaches put players in groups by level, but not perfectly: around the split the best of
  // group 2 and the weakest of group 1 overlap, which is the problem being solved.
  const judged = levels.map((level) => level + gaussian(random, 0, 70));
  const cutoff = [...judged].sort((a, b) => a - b)[Math.floor(size / 2)];
  const members = levels.map((level, i): Member => {
    const r = random();
    return {
      id: `m${String(i + 1).padStart(2, '0')}`,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
      group: judged[i] >= cutoff ? 1 : 2,
      level,
      pref: r < 0.25 ? 'singles' : r < 0.7 ? 'either' : 'doubles',
      attendance: 0.65 + 0.3 * random(),
    };
  });

  // A few competition pairs of similar level, wanting to play together half the time.
  const byLevel = [...members].sort((a, b) => b.level - a.level);
  for (let made = 0, tries = 0; made < fixedPairs && tries < 100; tries++) {
    const k = Math.floor(random() * (byLevel.length - 1));
    const a = byLevel[k];
    const b = byLevel[k + 1];
    if (a.partnerId || b.partnerId) continue;
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.partnerShare = b.partnerShare = 0.5;
    made++;
  }
  return members;
}

// Everything is drawn for every member every evening, so the schedule doesn't depend on
// anything else and different setups can be compared on exactly the same evenings.
export function makeSchedule(members: Member[], evenings: number, rounds: number, random: Random): Schedule {
  return Array.from({ length: evenings }, () =>
    members.flatMap((m) => {
      const comes = random() < m.attendance;
      const mood = random();
      const energy: Energy = mood < 0.1 ? 'easy' : mood < 0.25 ? 'challenge' : 'normal';
      const restOk = energy === 'easy' && random() < 0.5;
      const arrives = random() < 0.1 ? 1 + Math.floor(random() * 2) : 0;
      const leaves = random() < 0.05 ? rounds - 2 : rounds;
      const skips = Array.from({ length: rounds }, () => random() < 0.03);
      return comes ? [{ id: m.id, energy, restOk, arrives, leaves, skips }] : [];
    }));
}
