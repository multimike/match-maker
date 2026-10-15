// Made-up players for trying the app before entering the club's real members.

import type { Pref } from '../engine/engine.ts';
import type { Group, Member } from './model.ts';
import { newId } from './store.ts';

// name, group, rating, matches, preference
const PLAYERS: [string, Group, number, number, Pref][] = [
  ['Wilma', 1, 1742, 31, 'singles'],
  ['Axel', 1, 1701, 26, 'singles'],
  ['Julia', 1, 1688, 22, 'either'],
  ['Anna', 1, 1664, 35, 'doubles'],
  ['Filip', 1, 1652, 18, 'singles'],
  ['Lars', 1, 1610, 28, 'either'],
  ['Johan', 1, 1597, 24, 'either'],
  ['Astrid', 1, 1571, 15, 'singles'],
  ['Viktor', 1, 1556, 20, 'doubles'],
  ['Oskar', 1, 1548, 7, 'either'],
  ['Ida', 1, 1533, 19, 'doubles'],
  ['Elias', 1, 1502, 12, 'singles'],
  ['Maja', 2, 1541, 16, 'doubles'],
  ['Lucas', 2, 1520, 21, 'either'],
  ['Ebba', 2, 1487, 14, 'either'],
  ['Gustav', 2, 1463, 23, 'singles'],
  ['Hanna', 2, 1432, 17, 'singles'],
  ['Emma', 2, 1418, 25, 'either'],
  ['Isak', 2, 1404, 9, 'either'],
  ['Ella', 2, 1386, 13, 'doubles'],
  ['Linnea', 2, 1371, 11, 'doubles'],
  ['Noah', 2, 1342, 4, 'either'],
  ['Klara', 2, 1309, 18, 'either'],
  ['Alva', 2, 1263, 2, 'doubles'],
];

// Two competition pairs.
const PAIRS: [string, string, number][] = [
  ['Anna', 'Julia', 0.5],
  ['Maja', 'Ida', 0.5],
];

export function demoMembers(now: number): Member[] {
  const members: Member[] = PLAYERS.map(([name, group, rating, matches, pref]) => ({
    id: newId(),
    name,
    group,
    rating,
    matches,
    pref,
    status: 'confirmed',
    createdAt: now,
  }));
  const byName = new Map(members.map((m) => [m.name, m]));
  for (const [a, b, share] of PAIRS) {
    const ma = byName.get(a)!;
    const mb = byName.get(b)!;
    Object.assign(ma, { partnerId: mb.id, partnerShare: share });
    Object.assign(mb, { partnerId: ma.id, partnerShare: share });
  }
  return members;
}
