// Small browser hooks: the hash route, a ticking clock, the screen wake lock, round cues, and
// fitting the TV's court grid to the screen.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { Round } from './model.ts';
import { usePrefs } from './prefs.ts';
import { audioReady, play, type Cue } from './sound.ts';
import { newId } from './store.ts';
import { WARNING_MS, remaining } from './timer.ts';

export type Route = 'tonight' | 'round' | 'members' | 'tv';

const ROUTES: Route[] = ['tonight', 'round', 'members', 'tv'];

function routeOf(hash: string): Route {
  const name = hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r === name) ?? 'tonight';
}

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeHash, () => routeOf(location.hash));
}

export function routeHref(route: Route): string {
  return route === 'tonight' ? '#/' : `#/${route}`;
}

export function go(route: Route) {
  location.hash = routeHref(route);
}

/** Opens the court display in its own window, to drag to the TV; or here if popups are blocked. */
export function openTvWindow() {
  const tv = window.open(`${location.pathname}#/tv`, 'matchmaker-tv', 'popup,width=1280,height=720');
  if (!tv) go('tv');
}

/** The current time, updated every `interval` ms while `active`. */
export function useNow(active: boolean, interval = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

/** Keeps the screen on while `active`. The browser drops the lock when the page is hidden. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => (stopped ? void l.release() : (lock = l)),
        () => {},
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

// Only one window should sound the cues. An open TV window with sound turned on says so every
// couple of seconds; the organiser's window stays quiet while it does.
const WINDOW_ID = newId();
const TV_KEY = 'matchmaker.tv';

function tvWithSoundElsewhere(): boolean {
  try {
    const tv = JSON.parse(localStorage.getItem(TV_KEY) ?? 'null') as { id: string; at: number; audio: boolean } | null;
    return !!tv && tv.id !== WINDOW_ID && tv.audio && Date.now() - tv.at < 5000;
  } catch {
    return false;
  }
}

export function useTvHeartbeat(audio: boolean) {
  useEffect(() => {
    const beat = () => {
      try {
        localStorage.setItem(TV_KEY, JSON.stringify({ id: WINDOW_ID, at: Date.now(), audio }));
      } catch {
        // Without the heartbeat both windows may sound; harmless.
      }
    };
    beat();
    const id = setInterval(beat, 2000);
    return () => {
      clearInterval(id);
      try {
        localStorage.removeItem(TV_KEY);
      } catch {
        // ignore
      }
    };
  }, [audio]);
}

/** Plays the start whistle, the 2-minute warning and the buzzer as the round's timer passes them. */
export function useRoundCues(round: Round | undefined, now: number, isTv: boolean) {
  const { sound } = usePrefs();
  const last = useRef<{ id: string; left: number } | null>(null);
  useEffect(() => {
    if (!round || round.status !== 'playing' || round.timer.startedAt === null) {
      last.current = null;
      return;
    }
    const left = remaining(round.timer, now);
    const before = last.current?.id === round.id ? last.current.left : null;
    last.current = { id: round.id, left };
    const cue = (name: Cue) => {
      if (sound && (isTv ? audioReady() : !tvWithSoundElsewhere())) play(name);
    };
    if (before === null) {
      if (now - round.timer.startedAt < 3000) cue('start');
      return;
    }
    if (before > WARNING_MS && left <= WARNING_MS && left > 0) cue('warning');
    if (before > 0 && left === 0) cue('buzzer');
  }, [round, now, isTv, sound]);
}

/**
 * Columns and card width that make `count` cards of the given aspect ratio (width / height) as
 * big as possible inside the element.
 */
export function useFitGrid(ref: RefObject<HTMLElement | null>, count: number, aspect: number, gap: number) {
  const [fit, setFit] = useState({ cols: Math.min(count, 4), width: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width: W, height: H } = el.getBoundingClientRect();
      // Wider rows read more naturally (courts in number order, left to right), so fewer
      // columns only win when they make the cards clearly bigger.
      let best = { cols: 1, width: 0 };
      for (let cols = Math.max(1, count); cols >= 1; cols--) {
        const rows = Math.ceil(count / cols);
        const w = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * aspect);
        if (w > best.width * 1.08) best = { cols, width: Math.floor(w) };
      }
      setFit(best);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, count, aspect, gap]);
  return fit;
}
