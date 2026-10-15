// Singles, doubles or either, as a tiny court seen from above with one or two players a side.

import type { Pref } from '../../engine/engine.ts';

export function PrefIcon({ pref, title }: { pref: Pref; title?: string }) {
  const dot = (cx: number, cy: number, hollow = false) => (
    <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="2.3" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.2" />
  );
  return (
    <svg className="pref-icon" viewBox="0 0 32 18" width="32" height="18" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect x="1" y="1" width="30" height="16" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.3" />
      <line x1="16" y1="0.5" x2="16" y2="17.5" stroke="currentColor" strokeWidth="1.6" />
      {pref === 'singles' && [dot(8.5, 9), dot(23.5, 9)]}
      {pref === 'doubles' && [dot(8.5, 5.5), dot(8.5, 12.5), dot(23.5, 5.5), dot(23.5, 12.5)]}
      {pref === 'either' && [dot(8.5, 5.5), dot(8.5, 12.5, true), dot(23.5, 5.5), dot(23.5, 12.5, true)]}
    </svg>
  );
}
