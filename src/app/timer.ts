// The round timer. Times are wall-clock milliseconds (Date.now()), so the time left survives a
// reload and the organiser's window and the TV window always agree.

import type { Timer } from './model.ts';

/** The "last 2 minutes" warning. */
export const WARNING_MS = 2 * 60_000;

export function newTimer(minutes: number): Timer {
  return { durationMs: minutes * 60_000, startedAt: null, pausedAt: null, pausedMs: 0 };
}

export function elapsed(t: Timer, now: number): number {
  if (t.startedAt === null) return 0;
  return Math.max(0, (t.pausedAt ?? now) - t.startedAt - t.pausedMs);
}

export function remaining(t: Timer, now: number): number {
  return Math.max(0, t.durationMs - elapsed(t, now));
}

export type TimerPhase = 'ready' | 'running' | 'paused' | 'warning' | 'over';

export function timerPhase(t: Timer, now: number): TimerPhase {
  if (t.startedAt === null) return 'ready';
  const left = remaining(t, now);
  if (left === 0) return 'over';
  if (t.pausedAt !== null) return 'paused';
  return left <= WARNING_MS ? 'warning' : 'running';
}

export function startTimer(t: Timer, now: number): Timer {
  return { ...t, startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function pauseTimer(t: Timer, now: number): Timer {
  return t.startedAt === null || t.pausedAt !== null || remaining(t, now) === 0 ? t : { ...t, pausedAt: now };
}

export function resumeTimer(t: Timer, now: number): Timer {
  return t.pausedAt === null ? t : { ...t, pausedAt: null, pausedMs: t.pausedMs + now - t.pausedAt };
}

/** Adds time; after the buzzer, counts from now. */
export function addTime(t: Timer, ms: number, now: number): Timer {
  return { ...t, durationMs: Math.max(t.durationMs, elapsed(t, now)) + ms };
}

/** Ends the round now: the buzzer goes. */
export function finishTimer(t: Timer, now: number): Timer {
  const running = resumeTimer(t, now);
  return { ...running, durationMs: elapsed(running, now) };
}

/** Time left as m:ss, rounding up so the buzzer goes as 0:00 appears. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
