// Simulates seasons of match nights with made-up clubs, to see how well the engine serves
// everyone and to tune its weights before anyone sets foot on court.
//
//   npm run sim                     3 seasons of 20 evenings
//   npm run sim -- --seasons 1      quicker
//
// Members have a hidden true level. The engine only sees ratings, which start from the
// member's group and move with the simulated results, as in the real app.

import { parseArgs } from 'node:util';
import type { Plan } from '../src/engine/engine.ts';
import type { Ratings } from '../src/engine/rating.ts';
import type { Member } from './club.ts';
import { average, summarize, timeline, type Summary } from './metrics.ts';
import { runSeason, season, timings, type Seeding } from './season.ts';

const { values: args } = parseArgs({
  options: {
    seasons: { type: 'string', default: '3' },
    evenings: { type: 'string', default: '20' },
    rounds: { type: 'string', default: '8' },
    seed: { type: 'string', default: '1' },
  },
});
const SEASONS = Number(args.seasons);
const options = { seed: Number(args.seed), evenings: Number(args.evenings), rounds: Number(args.rounds) };
const { evenings: EVENINGS, rounds: ROUNDS } = options;
// Most numbers are measured from evening 6 on, once ratings have had time to settle.
const SETTLED = Math.min(5, EVENINGS - 1);

const pct = (x: number) => `${Math.round(100 * x)}%`;
const dec = (x: number, digits = 1) => x.toFixed(digits);

function printTable(columns: string[], rows: string[][]) {
  const label = Math.max(...rows.map((r) => r[0].length), columns[0].length);
  const widths = columns.slice(1).map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i + 1] ?? '').length)) + 2);
  const line = (cells: string[]) => cells[0].padEnd(label) + cells.slice(1).map((c, i) => c.padStart(widths[i])).join('');
  console.log(line(columns));
  for (const row of rows) console.log(row.length === 1 ? row[0] : line(row));
  console.log();
}

const SUMMARY_ROWS: [string, ((s: Summary) => string)?][] = [
  ['Players per night', (s) => dec(s.playersPerNight)],
  ['Challenging matches (equal or better opposition)'],
  ['  everyone', (s) => pct(s.challenging.all)],
  ['  the worst-served 10% of players', (s) => pct(s.challenging.worst10)],
  ['  best quarter of group 2', (s) => pct(s.challenging.topOfGroup2)],
  ['  weakest quarter of group 1', (s) => pct(s.challenging.bottomOfGroup1)],
  ['  top 3 of the club', (s) => pct(s.challenging.top3)],
  ['  bottom 3 of the club', (s) => pct(s.challenging.bottom3)],
  ['Nights meeting one of the club\'s top quarter'],
  ['  best quarter of group 2', (s) => pct(s.metTop.topOfGroup2)],
  ['  weakest quarter of group 1', (s) => pct(s.metTop.bottomOfGroup1)],
  ['Clear favourite (playing down)', (s) => pct(s.easy)],
  ['Lopsided (200+ points between sides)', (s) => pct(s.lopsided)],
  ['Partner similar or slightly better', (s) => pct(s.partnerGood)],
  ['Very different partner, per player per night', (s) => dec(s.bigGapsPerNight, 2)],
  ['Share of matches in singles'],
  ['  prefers singles', (s) => pct(s.singlesShare.singles)],
  ['  either', (s) => pct(s.singlesShare.either)],
  ['  prefers doubles', (s) => pct(s.singlesShare.doubles)],
  ['Rests per player per night', (s) => dec(s.restsPerNight, 2)],
  ['Most rests in a row (not asked for)', (s) => dec(s.maxRestStreak)],
  ['Different people met per night', (s) => dec(s.distinctPerNight)],
  ['Same partner again, per player per night', (s) => dec(s.partnerRepeatsPerNight, 2)],
  ['Close-level pairs who met this season', (s) => pct(s.coverage)],
  ['Fixed pairs together (asked for 50%)', (s) => pct(s.fixedTogether)],
  ['Courts mixing both groups', (s) => pct(s.mixedCourts)],
];

function printSummaries(columns: string[], summaries: Summary[]) {
  printTable(['', ...columns], SUMMARY_ROWS.map(([label, value]) => (value ? [label, ...summaries.map(value)] : [label])));
}

const seasons = <T>(fn: (s: number) => T): T[] => Array.from({ length: SEASONS }, (_, s) => fn(s));

console.log(`Match night simulation: ${SEASONS} season(s) of ${EVENINGS} evenings, ${ROUNDS} rounds per evening.`);
console.log(`Measured with true levels over evenings ${SETTLED + 1}–${EVENINGS}, averaged over seasons.\n`);

// 1. Today's two groups against one combined night, and the ceiling with perfect ratings.
{
  let sample: { club: Member[]; plan: Plan; ratings: Ratings } | undefined;
  const results = seasons((s) => {
    const { club, schedule, random } = season(34, s, options);
    const groups = [1, 2].map((g) => ({ members: club.filter((m) => m.group === g), courts: 6 }));
    const combined = [{ members: club, courts: 8 }];
    const run = (sessions: typeof combined, seeding: Seeding) =>
      summarize(runSeason({ sessions, schedule, rounds: ROUNDS, seeding, random: random() }), SETTLED);
    const today = run(groups, 'group');
    const together = summarize(runSeason({
      sessions: combined,
      schedule,
      rounds: ROUNDS,
      seeding: 'group',
      random: random(),
      onRound: (e, r, plan, ratings) => {
        if (s === 0 && e === Math.min(9, EVENINGS - 1) && r === Math.min(2, ROUNDS - 1)) sample = { club, plan, ratings };
      },
    }), SETTLED);
    return [today, together, run(combined, 'perfect')];
  });
  console.log('1. TODAY VS ONE COMBINED NIGHT');
  console.log('   A club of 34. Today: each group on its own night with 6 courts. Combined: everyone on 8 courts.');
  console.log('   "Perfect ratings" lets the engine see true levels: impossible in practice, but it shows how');
  console.log('   much is lost to ratings that are never quite right.\n');
  printSummaries(['Today', 'Combined', 'Perfect ratings'], [0, 1, 2].map((i) => average(results.map((r) => r[i]))));

  if (sample) {
    const { club, plan, ratings } = sample;
    const byId = new Map(club.map((m) => [m.id, m]));
    const who = (id: string) => {
      const m = byId.get(id)!;
      return `${m.name} (${m.level}/${Math.round(ratings[id].rating)} g${m.group} ${m.pref[0]})`;
    };
    console.log(`   Example: evening ${Math.min(10, EVENINGS)}, round ${Math.min(3, ROUNDS)}.`);
    console.log('   (true level / rating, group, preference: s = singles, e = either, d = doubles)');
    plan.courts.forEach((court, i) => {
      console.log(`   Court ${i + 1}  ${court.type.padEnd(7)}  ${court.sides[0].map(who).join(' & ')}  vs  ${court.sides[1].map(who).join(' & ')}`);
    });
    if (plan.resting.length) console.log(`   Resting: ${plan.resting.map((id) => byId.get(id)!.name).join(', ')}`);
    console.log();
  }
}

// 2. How the night copes with different numbers of players.
{
  const sizes = [14, 22, 34, 40, 46, 52];
  const results = sizes.map((size) => average(seasons((s) => {
    const { club, schedule, random } = season(size, s, options);
    return summarize(runSeason({ sessions: [{ members: club, courts: 8 }], schedule, rounds: ROUNDS, seeding: 'group', random: random() }), SETTLED);
  })));
  console.log('2. NUMBER OF PLAYERS (combined night, 8 courts)\n');
  printSummaries(sizes.map((n) => `${n} members`), results);
}

// 3. Starting ratings: all equal, from the group, or group plus a few organiser corrections.
{
  const seedings: Seeding[] = ['equal', 'group', 'nudged'];
  const lines = seedings.map((seeding) => average(seasons((s) => {
    const { club, schedule, random } = season(34, s, options);
    return timeline(runSeason({ sessions: [{ members: club, courts: 8 }], schedule, rounds: ROUNDS, seeding, random: random() }));
  })));
  console.log('3. STARTING RATINGS (34 members, combined night)');
  console.log('   Challenging matches, and how well ratings order players by true level (1 = perfectly).\n');
  const evenings = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20].filter((e) => e <= EVENINGS);
  printTable(
    ['Evening', 'All equal', 'order', 'From group', 'order', 'Group + fixes', 'order'],
    evenings.map((e) => [String(e), ...lines.flatMap((line) => [pct(line[e - 1].challenging), dec(line[e - 1].correlation, 2)])]),
  );
}

timings.sort((a, b) => a - b);
console.log(`Engine time per round: median ${dec(timings[Math.floor(timings.length / 2)])} ms, slowest ${dec(timings[timings.length - 1])} ms (${timings.length} rounds).`);
