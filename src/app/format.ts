// Turning data into text for the screens.

import type { Capacity } from './model.ts';
import type { Strings } from './strings.ts';

export function formatDate(t: Strings, date: string, withWeekday = true): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(t.locale, { weekday: withWeekday ? 'long' : undefined, day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
}

/** What tonight's numbers mean for the next round, as short sentences. */
export function capacityLines(t: Strings, c: Capacity, courts: number, softLimit?: number): string[] {
  if (c.playing < 2) return [t.capacity.tooFew];
  const lines: string[] = [];
  if (c.resting === 0) lines.push(t.capacity.allPlay);
  else if (c.resting === 1 && c.playing < 4 * courts) lines.push(t.capacity.oddRests);
  else lines.push(t.capacity.rests(c.resting, Math.max(2, Math.round((c.playing + c.resting) / c.resting))));
  if (c.maxSingles > 0) lines.push(t.capacity.singlesRoom(c.maxSingles));
  else lines.push(c.resting > 1 ? t.capacity.noSingles : t.capacity.doublesOnly);
  if (c.skipping > 0) lines.push(t.capacity.skipping(c.skipping));
  if (c.overLimit && softLimit !== undefined) lines.push(t.capacity.overLimit(softLimit));
  return lines;
}

/** A rating change: +12, −7 or ±0. */
export function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '±0';
}

/** Names joined for a sentence: "Anna", "Anna och Bo", "Anna, Bo och Cleo". */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
