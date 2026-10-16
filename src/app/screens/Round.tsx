// The round: make it, start it, run the timer, and enter who won. After saving, the round's
// results stay up (with rating changes) until the next round is made, and can be corrected.

import { useState } from 'react';
import { Avatar } from '../components/Avatar.tsx';
import { CourtCard } from '../components/CourtCard.tsx';
import type { Tag } from '../components/CourtView.tsx';
import { Confetti } from '../components/Shuttle.tsx';
import { useConfirm } from '../components/ui.tsx';
import { capacityLines, joinNames, signed } from '../format.ts';
import { go, openTvWindow, useNow } from '../hooks.ts';
import { capacity, isHere, latestRound, openSession, type AppState, type Round, type Session } from '../model.ts';
import { isUpset } from '../results.ts';
import { useAppState, useDispatch } from '../store.ts';
import { useStrings, type Strings } from '../strings.ts';
import { clock, remaining, timerPhase } from '../timer.ts';

export function RoundScreen() {
  const t = useStrings();
  const state = useAppState();
  const session = openSession(state);
  if (!session) {
    return (
      <div className="page">
        <div className="empty">
          <p className="empty-title">{t.rounds.none}</p>
          <button type="button" className="button button--primary" onClick={() => go('tonight')}>
            {t.rounds.toTonight}
          </button>
        </div>
      </div>
    );
  }
  const round = latestRound(session);
  return round && round.status !== 'done' ? <ActiveRound session={session} round={round} /> : <NextRound session={session} last={round} />;
}

/** Name tags for a court's two sides. */
function useSides(state: AppState) {
  const t = useStrings();
  const names = new Map(state.members.map((m) => [m.id, m.name]));
  return (sides: [string[], string[]], note: (id: string) => string | undefined): [Tag[], Tag[]] =>
    sides.map((side) => side.map((id) => ({ id, name: names.get(id) ?? t.removed, note: note(id) }))) as [Tag[], Tag[]];
}

function NextRound({ session, last }: { session: Session; last?: Round }) {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const here = state.members.filter((m) => isHere(session.checkIns[m.id]));
  const skipping = here.filter((m) => session.checkIns[m.id].skip).length;
  const cap = capacity(here.length, skipping, session.courts, session.softLimit);
  const next = (last?.number ?? 0) + 1;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t.round(next)}</h1>
          <ul className="capacity capacity--inline">
            {capacityLines(t, cap, session.courts, session.softLimit).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="page-actions">
          <button type="button" className="button button--primary button--big" disabled={cap.playing < 2} onClick={() => dispatch({ type: 'round/plan' })}>
            {t.rounds.make(next)}
          </button>
        </div>
      </header>
      {last && <RoundSummary round={last} />}
    </div>
  );
}

function RoundSummary({ round }: { round: Round }) {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const sides = useSides(state);
  const [correcting, setCorrecting] = useState(false);
  const before = round.ratingsBefore ?? {};
  const rating = new Map(state.members.map((m) => [m.id, m.rating]));
  const delta = (id: string) => {
    const now = rating.get(id);
    return now === undefined || !before[id] ? undefined : signed(now - before[id].rating);
  };
  const justSaved = round.finishedAt !== undefined && Date.now() - round.finishedAt < 4000;
  return (
    <section className="summary" aria-label={t.rounds.roundDone(round.number)}>
      {justSaved && <Confetti key={round.id} />}
      <div className="summary-head">
        <h2 className="section-title">{t.rounds.roundDone(round.number)}</h2>
        <button type="button" className={`button ${correcting ? 'button--primary' : 'button--quiet'}`} onClick={() => setCorrecting(!correcting)} aria-pressed={correcting}>
          {correcting ? t.done : t.rounds.correct}
        </button>
      </div>
      {correcting && <p className="field-hint">{t.rounds.correctHint}</p>}
      <div className="court-grid">
        {round.courts.map((court, i) => (
          <CourtCard
            key={i}
            number={i + 1}
            court={court}
            sides={sides(court.sides, delta)}
            result={round.results[i]}
            upset={isUpset(court, before, round.results[i].winner)}
            onResult={correcting ? (result) => dispatch({ type: 'result/set', roundId: round.id, court: i, result }) : undefined}
          />
        ))}
      </div>
      <Resting ids={round.resting} state={state} />
    </section>
  );
}

function ActiveRound({ session, round }: { session: Session; round: Round }) {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const sides = useSides(state);
  const playing = round.status === 'playing';
  const rating = new Map(state.members.map((m) => [m.id, Math.round(m.rating)]));

  const planned = new Set(round.players.map((p) => p.id));
  const leftNames = round.players
    .filter((p) => !isHere(session.checkIns[p.id]))
    .map((p) => state.members.find((m) => m.id === p.id)?.name ?? t.removed);
  const newcomers = Object.values(session.checkIns).filter((c) => isHere(c) && !planned.has(c.memberId)).length;
  // Only when it matters: more courts for a round that used all it had, or fewer than it needs.
  const courtChange = round.courtsAvailable === undefined
    ? 0
    : session.courts > round.courtsAvailable && round.courts.length >= round.courtsAvailable
      ? session.courts - round.courtsAvailable
      : session.courts < round.courts.length ? session.courts - round.courts.length : 0;
  const missing = round.results.filter((r) => r.winner === null).length;

  const save = async () => {
    if (missing === 0 || (await confirm(t.rounds.missing(missing), t.rounds.saveAnyway, false))) {
      dispatch({ type: 'round/save' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const discard = async () => {
    if (await confirm(t.rounds.discardConfirm(round.number), t.rounds.discard)) dispatch({ type: 'round/discard' });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t.round(round.number)}</h1>
          {!playing && <p className="page-lead">{t.rounds.planned}</p>}
        </div>
        <div className="page-actions">
          <button type="button" className="button button--quiet" onClick={openTvWindow}>
            {t.rounds.showTv}
          </button>
          {!playing && (
            <>
              <button type="button" className="button button--quiet" onClick={() => dispatch({ type: 'round/plan' })}>
                {t.rounds.shuffle}
              </button>
              <button type="button" className="button button--primary button--big" onClick={() => dispatch({ type: 'round/start' })}>
                {t.rounds.start(Math.round(round.timer.durationMs / 60_000))}
              </button>
            </>
          )}
        </div>
      </header>

      {!playing && (leftNames.length > 0 || newcomers > 0 || courtChange !== 0) && (
        <div className="notice">
          {courtChange !== 0 && <span>{t.rounds.courtsSince(courtChange)}</span>}
          {leftNames.length > 0 && <span>{t.rounds.leftSince(joinNames(leftNames, t.and))}</span>}
          {newcomers > 0 && <span>{t.rounds.newSince(newcomers)}</span>}
        </div>
      )}

      {playing && <TimerPanel round={round} />}

      {playing && (
        <div className="results-head">
          <h2 className="section-title">{t.rounds.whoWon}</h2>
          <p className="field-hint">{t.rounds.whoWonHint}</p>
        </div>
      )}

      <div className="court-grid">
        {round.courts.map((court, i) => (
          <CourtCard
            key={i}
            number={i + 1}
            court={court}
            sides={sides(court.sides, (id) => (rating.has(id) ? String(rating.get(id)) : undefined))}
            result={round.results[i]}
            onResult={playing ? (result) => dispatch({ type: 'result/set', roundId: round.id, court: i, result }) : undefined}
          />
        ))}
      </div>

      <Resting ids={round.resting} state={state} />

      <footer className="round-foot">
        <button type="button" className="button button--danger-quiet" onClick={discard}>
          {t.rounds.discard}
        </button>
        {playing && (
          <div className="round-foot-save">
            {missing > 0 && <span className="field-hint">{t.rounds.missing(missing)}</span>}
            <button type="button" className="button button--primary button--big" onClick={save}>
              {t.rounds.saveResults}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

function timerNote(t: Strings, phase: ReturnType<typeof timerPhase>): string {
  if (phase === 'warning') return t.rounds.lastTwo;
  if (phase === 'over') return `${t.rounds.timeUp} ${t.rounds.buzzerRule}`;
  if (phase === 'paused') return t.rounds.paused;
  return '';
}

// Only the timer ticks, so the courts below don't re-render four times a second.
function TimerPanel({ round }: { round: Round }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const now = useNow(true);
  const phase = timerPhase(round.timer, now);
  const left = remaining(round.timer, now);
  const done = 1 - left / round.timer.durationMs;
  return (
    <section className="timer" data-phase={phase} aria-label={t.round(round.number)}>
      <div className="timer-clock" role="timer">{clock(left)}</div>
      <p className="timer-note" aria-live="polite">{timerNote(t, phase)}</p>
      <div className="timer-track" aria-hidden="true">
        <span className="timer-fill" style={{ transform: `scaleX(${done})` }} />
      </div>
      <div className="timer-actions">
        {phase !== 'over' &&
          (phase === 'paused' ? (
            <button type="button" className="button button--primary" onClick={() => dispatch({ type: 'timer/resume' })}>
              {t.rounds.resume}
            </button>
          ) : (
            <button type="button" className="button button--quiet" onClick={() => dispatch({ type: 'timer/pause' })}>
              {t.rounds.pause}
            </button>
          ))}
        <button type="button" className="button button--quiet" onClick={() => dispatch({ type: 'timer/add', ms: 60_000 })}>
          {t.rounds.addMinute}
        </button>
        {phase !== 'over' && (
          <button
            type="button"
            className="button button--quiet"
            onClick={async () => {
              if (await confirm(t.rounds.endNowConfirm, t.rounds.endNow, false)) dispatch({ type: 'timer/finish' });
            }}
          >
            {t.rounds.endNow}
          </button>
        )}
      </div>
    </section>
  );
}

export function Resting({ ids, state }: { ids: string[]; state: AppState }) {
  const t = useStrings();
  const names = new Map(state.members.map((m) => [m.id, m.name]));
  return (
    <section className="resting">
      <h2 className="resting-title">💤 {ids.length ? t.resting : t.nobodyRests}</h2>
      {ids.length > 0 && (
        <ul className="resting-list">
          {ids.map((id) => (
            <li key={id} className="resting-name">
              <Avatar id={id} name={names.get(id) ?? '?'} />
              {names.get(id) ?? t.removed}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
