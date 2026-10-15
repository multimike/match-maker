// The organiser's top bar: the shuttle mark, the three screens, the TV view, language and settings.

import { useState, type ReactNode } from 'react';
import { Shuttle } from '../components/Shuttle.tsx';
import { openTvWindow, routeHref, useNow, type Route } from '../hooks.ts';
import { isHere, latestRound, openSession } from '../model.ts';
import { setPrefs, usePrefs, type Lang } from '../prefs.ts';
import { useAppState } from '../store.ts';
import { useStrings } from '../strings.ts';
import { clock, remaining, timerPhase } from '../timer.ts';
import { Settings } from './Settings.tsx';

function TvIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.3 2h3.4l.5 2.6a7.8 7.8 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7.9 7.9 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7.8 7.8 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.8 7.8 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7.9 7.9 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7.8 7.8 0 0 1 1.9-1.1zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
    </svg>
  );
}

export function Nav({ route }: { route: Route }) {
  const t = useStrings();
  const { lang } = usePrefs();
  const state = useAppState();
  const [settings, setSettings] = useState(false);
  const session = openSession(state);
  const here = session ? Object.values(session.checkIns).filter(isHere).length : 0;
  const round = latestRound(session);
  const playing = round?.status === 'playing';
  const now = useNow(playing, 500);
  const phase = playing ? timerPhase(round.timer, now) : undefined;

  const tab = (to: Route, label: string, extra?: ReactNode) => (
    <a className="tab" href={routeHref(to)} aria-current={route === to ? 'page' : undefined}>
      {label}
      {extra}
    </a>
  );

  return (
    <header className="topbar">
      <a className="brand" href={routeHref('tonight')} aria-label={t.appName}>
        <Shuttle size={36} className="brand-mark" />
        <span className="brand-name">{t.appName}</span>
      </a>
      <nav className="tabs" aria-label={t.appName}>
        {tab('tonight', t.nav.tonight, session && <span className="tab-count">{here}</span>)}
        {tab(
          'round',
          t.nav.round,
          playing ? (
            <span className="tab-clock" data-phase={phase}>
              {clock(remaining(round.timer, now))}
            </span>
          ) : (
            round && round.status === 'planned' && <span className="tab-count">{round.number}</span>
          ),
        )}
        {tab('members', t.nav.members)}
      </nav>
      <div className="topbar-tools">
        <button type="button" className="tool" onClick={openTvWindow} title={t.nav.openTv}>
          <TvIcon />
          <span className="tool-label">{t.nav.tv}</span>
        </button>
        <div className="lang" role="radiogroup" aria-label={t.settings.language}>
          {(['sv', 'en'] as Lang[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className="lang-option" title={t.languages[l]} onClick={() => setPrefs({ lang: l })}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className="tool" onClick={() => setSettings(true)} aria-label={t.nav.settings} title={t.nav.settings}>
          <GearIcon />
        </button>
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </header>
  );
}
