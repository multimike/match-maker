// The court display for the TV in the hall: big, bold and readable from a distance. Court numbers
// and names first, decoration second. It follows the organiser's window live (same device,
// shared storage), sounds the cues, and keeps the screen awake.

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar.tsx';
import { CourtCard } from '../components/CourtCard.tsx';
import type { Tag } from '../components/CourtView.tsx';
import { RoundCues } from '../components/RoundCues.tsx';
import { Confetti, Shuttle } from '../components/Shuttle.tsx';
import { go, useFitGrid, useNow, useTvHeartbeat, useWakeLock } from '../hooks.ts';
import { isHere, latestRound, openSession, type AppState, type Round } from '../model.ts';
import { audioReady, unlockAudio } from '../sound.ts';
import { useAppState } from '../store.ts';
import { useStrings } from '../strings.ts';
import { clock, remaining, timerPhase, type TimerPhase } from '../timer.ts';

// A TV card is the court (13.40 × 6.10) plus a header and gap 16% of the card's width tall.
const CARD_ASPECT = 1 / (610 / 1340 + 0.16);

export function TvScreen() {
  const t = useStrings();
  const state = useAppState();
  const session = openSession(state);
  const round = latestRound(session);
  // The titles follow the timer's phase; only TvClock ticks fast.
  const now = useNow(round?.status === 'playing', 500);
  const [audio, setAudio] = useState(audioReady);

  useTvHeartbeat(audio);
  useWakeLock(true);
  useEffect(() => {
    document.title = `${t.nav.tv}: ${t.appName}`;
  }, [t]);

  const phase: TimerPhase | 'done' | 'none' = !round ? 'none' : round.status === 'done' ? 'done' : timerPhase(round.timer, now);

  let title = t.tv.welcome;
  let subtitle = '';
  if (!session) {
    title = t.appName;
    subtitle = t.tv.noEvening;
  } else if (!round) {
    subtitle = t.tv.firstSoon;
  } else if (round.status === 'done') {
    title = t.rounds.roundDone(round.number);
    subtitle = t.tv.nextSoon;
  } else {
    title = t.round(round.number);
    subtitle = phase === 'ready' ? t.tv.findCourt : phase === 'warning' ? t.rounds.lastTwo : phase === 'over' ? t.rounds.buzzerRule : phase === 'paused' ? t.rounds.paused : '';
  }

  return (
    <div className="tv" data-phase={phase}>
      <header className="tv-head">
        <Shuttle size="1em" className="tv-mark" />
        <div className="tv-titles">
          <h1 className="tv-title">{phase === 'over' ? t.rounds.timeUp : title}</h1>
          {subtitle && <p className="tv-subtitle">{subtitle}</p>}
        </div>
        {round && <TvClock round={round} />}
      </header>

      <main className="tv-main">
        {!session && <Shuttle size="30vmin" className="tv-big-shuttle" />}
        {session && !round && <HereTonight state={state} />}
        {round && <TvCourts round={round} state={state} />}
      </main>

      {round && <TvResting ids={round.resting} state={state} />}

      {!audio && (
        <button
          type="button"
          className="tv-start"
          onClick={() => {
            unlockAudio();
            setAudio(true);
            document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        >
          <span className="tv-start-title">🔈 {t.tv.start}</span>
          <span className="tv-start-hint">{t.tv.startHint}</span>
        </button>
      )}
      <RoundCues round={round} isTv />
      <TvControls />
    </div>
  );
}

/** The clock and its track. After the round they keep their space (hidden), so the courts stay put. */
function TvClock({ round }: { round: Round }) {
  const now = useNow(round.status === 'playing');
  const left = remaining(round.timer, now);
  const done = round.status === 'done' || undefined;
  return (
    <>
      <div className="tv-clock" role="timer" data-done={done}>
        {clock(left)}
      </div>
      <div className="tv-track" aria-hidden="true" data-done={done}>
        <span className="tv-fill" style={{ transform: `scaleX(${1 - left / round.timer.durationMs})` }} />
      </div>
    </>
  );
}

function tagsFor(state: AppState, fallback: string) {
  const names = new Map(state.members.map((m) => [m.id, m.name]));
  return (sides: [string[], string[]]): [Tag[], Tag[]] =>
    sides.map((side) => side.map((id) => ({ id, name: names.get(id) ?? fallback }))) as [Tag[], Tag[]];
}

function TvCourts({ round, state }: { round: Round; state: AppState }) {
  const t = useStrings();
  const ref = useRef<HTMLDivElement>(null);
  const gap = 24;
  const fit = useFitGrid(ref, round.courts.length, CARD_ASPECT, gap);
  const tags = tagsFor(state, t.removed);
  const celebrate = round.status === 'done' && round.finishedAt !== undefined && Date.now() - round.finishedAt < 5000;
  return (
    <div ref={ref} className="tv-courts">
      <div className="tv-grid" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${fit.width}px)`, gap }}>
        {round.courts.map((court, i) => (
          <CourtCard key={i} number={i + 1} court={court} sides={tags(court.sides)} result={round.results[i]} variant="tv" />
        ))}
      </div>
      {celebrate && <Confetti key={round.id} />}
    </div>
  );
}

function HereTonight({ state }: { state: AppState }) {
  const t = useStrings();
  const session = openSession(state)!;
  const here = state.members
    .filter((m) => isHere(session.checkIns[m.id]))
    .sort((a, b) => a.name.localeCompare(b.name, t.locale));
  return (
    <section className="tv-here">
      <p className="tv-here-count">{t.tv.hereTonight(here.length)}</p>
      <ul className="tv-here-list">
        {here.map((m) => (
          <li key={m.id} className="tag tv-here-tag">
            <Avatar id={m.id} name={m.name} className="tag-avatar" />
            <span className="tag-name">{m.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TvResting({ ids, state }: { ids: string[]; state: AppState }) {
  const t = useStrings();
  const names = new Map(state.members.map((m) => [m.id, m.name]));
  return (
    <footer className="tv-resting">
      <span className="tv-resting-title">💤 {ids.length ? t.resting : t.nobodyRests}</span>
      <ul className="tv-resting-list">
        {ids.map((id) => (
          <li key={id} className="tv-resting-name">
            <Avatar id={id} name={names.get(id) ?? '?'} />
            {names.get(id) ?? t.removed}
          </li>
        ))}
      </ul>
    </footer>
  );
}

/** Back and full screen, shown while the mouse moves (or after a tap), hidden otherwise. */
function TvControls() {
  const t = useStrings();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timeout = 0;
    const show = () => {
      setVisible(true);
      clearTimeout(timeout);
      timeout = window.setTimeout(() => setVisible(false), 3000);
    };
    window.addEventListener('pointermove', show);
    window.addEventListener('pointerdown', show);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('pointermove', show);
      window.removeEventListener('pointerdown', show);
    };
  }, []);
  return (
    <div className="tv-controls" data-visible={visible || undefined}>
      <button type="button" className="tv-control" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
        {t.tv.fullscreen}
      </button>
      <button
        type="button"
        className="tv-control"
        onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          if (window.opener) window.close();
          else go('round');
        }}
      >
        {t.tv.back}
      </button>
    </div>
  );
}
