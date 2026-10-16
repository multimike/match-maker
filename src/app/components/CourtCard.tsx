// A court card: the court number, singles or doubles, the court drawing with the players, and on
// the organiser's screen the result entry (tap the winning side, optional score).

import { useEffect, useState } from 'react';
import type { Court } from '../../engine/engine.ts';
import type { CourtResult } from '../model.ts';
import { pickWinner, resultFromScore, validScore, winnerFromScore } from '../results.ts';
import { useStrings } from '../strings.ts';
import { CourtView, type Tag } from './CourtView.tsx';

interface CourtCardProps {
  number: number;
  court: Court;
  sides: [Tag[], Tag[]];
  result?: CourtResult;
  /** Turns on result entry. */
  onResult?: (result: CourtResult) => void;
  upset?: boolean;
  variant?: 'organiser' | 'tv';
}

export function CourtCard({ number, court, sides, result, onResult, upset, variant = 'organiser' }: CourtCardProps) {
  const t = useStrings();
  const level = !!result?.score && winnerFromScore(result.score) === null && result.winner === null;
  return (
    <article className={`court-card court-card--${variant}`} aria-label={t.court(number)}>
      <header className="court-card-head">
        <span className="court-number" aria-hidden="true">{number}</span>
        <span className="court-card-title">
          <span className="court-card-name">{t.court(number)}</span>
          <span className="court-card-type">{t.type[court.type]}</span>
        </span>
        {upset && <span className="upset-tag">{t.rounds.upset}</span>}
      </header>
      <CourtView
        type={court.type}
        sides={sides}
        result={result}
        winLabel={t.rounds.win}
        invite={level}
        onPick={onResult && ((side) => onResult(pickWinner(result ?? { winner: null }, side)))}
      />
      {onResult && <ScoreEntry result={result ?? { winner: null }} onResult={onResult} level={level} />}
    </article>
  );
}

/** The optional score at the buzzer, under a court that takes results. */
export function ScoreEntry({ result, onResult, level }: { result: CourtResult; onResult: (r: CourtResult) => void; level: boolean }) {
  const t = useStrings();
  const [open, setOpen] = useState(!!result.score);
  const [a, setA] = useState(result.score ? String(result.score[0]) : '');
  const [b, setB] = useState(result.score ? String(result.score[1]) : '');

  // A deciding point or a tap that drops the score changes it from outside.
  const [sa, sb] = result.score ?? [];
  useEffect(() => {
    setA(sa === undefined ? '' : String(sa));
    setB(sb === undefined ? '' : String(sb));
    if (sa !== undefined) setOpen(true);
  }, [sa, sb]);

  const change = (nextA: string, nextB: string) => {
    setA(nextA);
    setB(nextB);
    const pa = Number(nextA);
    const pb = Number(nextB);
    if (nextA !== '' && nextB !== '' && validScore(pa) && validScore(pb)) onResult(resultFromScore([pa, pb]));
  };

  if (!open) {
    return (
      <footer className="score score--closed">
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          {t.rounds.addScore}
        </button>
      </footer>
    );
  }
  return (
    <footer className="score">
      <div className="score-inputs">
        <input className="input score-input" type="number" inputMode="numeric" min={0} max={30} aria-label={`${t.rounds.score} A`} value={a} onChange={(e) => change(e.target.value, b)} />
        <span className="score-dash" aria-hidden="true">–</span>
        <input className="input score-input" type="number" inputMode="numeric" min={0} max={30} aria-label={`${t.rounds.score} B`} value={b} onChange={(e) => change(a, e.target.value)} />
      </div>
      <p className="score-hint">{level ? t.rounds.level : t.rounds.scoreHint}</p>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setOpen(false);
          setA('');
          setB('');
          onResult({ winner: result.winner });
        }}
      >
        {t.rounds.clearScore}
      </button>
    </footer>
  );
}
