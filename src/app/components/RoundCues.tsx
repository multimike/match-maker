// Sounds the round's cues: start whistle, 2-minute warning, buzzer. A component of its own so the
// timer's ticks re-render nothing else.

import { useNow, useRoundCues } from '../hooks.ts';
import type { Round } from '../model.ts';

export function RoundCues({ round, isTv }: { round: Round | undefined; isTv: boolean }) {
  const now = useNow(round?.status === 'playing');
  useRoundCues(round, now, isTv);
  return null;
}
