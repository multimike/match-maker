// The members, ranked by rating. Provisional ratings are marked with how far along they are.

import { useMemo, useState } from 'react';
import { RATING, isProvisional } from '../../engine/rating.ts';
import { Avatar } from '../components/Avatar.tsx';
import { PrefIcon } from '../components/PrefIcon.tsx';
import { demoMembers } from '../demo.ts';
import { signed } from '../format.ts';
import { openSession, type Member } from '../model.ts';
import { useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';
import { MemberForm } from './MemberForm.tsx';

/** A small ring filling up over the provisional matches. */
function ProvisionalMark({ matches, title, label }: { matches: number; title: string; label: string }) {
  const share = Math.min(1, matches / RATING.provisionalMatches);
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <span className="prov" title={title}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 8 8)" />
      </svg>
      {label}
    </span>
  );
}

export function Members() {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const session = openSession(state);

  const ranked = useMemo(
    () => [...state.members].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, t.locale)),
    [state.members, t.locale],
  );
  const byId = new Map(state.members.map((m) => [m.id, m]));
  const q = query.trim().toLowerCase();
  const shown = q ? ranked.filter((m) => m.name.toLowerCase().includes(q)) : ranked;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t.members.title}</h1>
          <p className="page-lead">{t.members.lead(RATING.provisionalMatches)}</p>
        </div>
        <div className="page-actions">
          {state.members.length > 0 && (
            <input className="input input--search" type="search" placeholder={t.members.search} aria-label={t.members.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {state.members.length > 0 && (
            <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
              {t.members.add}
            </button>
          )}
        </div>
      </header>

      {state.members.length === 0 ? (
        <div className="empty">
          <p className="empty-title">{t.members.empty}</p>
          <p>{t.members.emptyHint}</p>
          <div className="empty-actions">
            <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
              {t.members.add}
            </button>
            <button type="button" className="button button--quiet" onClick={() => dispatch({ type: 'members/import', members: demoMembers(Date.now()) })}>
              {t.members.demo}
            </button>
          </div>
          <p className="field-hint">{t.members.demoHint}</p>
        </div>
      ) : (
        <ol className="ranking">
          {shown.map((m) => {
            const rank = ranked.indexOf(m) + 1;
            const partner = m.partnerId ? byId.get(m.partnerId) : undefined;
            const checkIn = session?.checkIns[m.id];
            const tonight = checkIn ? m.rating - checkIn.startRating : 0;
            return (
              <li key={m.id}>
                <button type="button" className="rank-row" onClick={() => setEditing(m)}>
                  <span className="rank-pos">{rank}</span>
                  <Avatar id={m.id} name={m.name} />
                  <span className="rank-name">
                    {m.name}
                    {m.status === 'new' && <span className="new-tag">{t.members.isNew}</span>}
                    {partner && <span className="rank-partner" title={t.members.partner}>🤝 {partner.name}</span>}
                  </span>
                  <span className="rank-rating">
                    <span className="rank-number">{Math.round(m.rating)}</span>
                    {isProvisional(m) && (
                      <ProvisionalMark matches={m.matches} label={t.members.provisional} title={t.members.provisionalTitle(m.matches, RATING.provisionalMatches)} />
                    )}
                    {Math.abs(tonight) >= 0.5 && (
                      <span className={`rank-delta ${tonight > 0 ? 'is-up' : 'is-down'}`}>{t.members.tonight(signed(tonight))}</span>
                    )}
                  </span>
                  <span className="rank-group">{t.members.groupN(m.group)}</span>
                  <span className="rank-pref" title={t.prefLong[m.pref]}>
                    <PrefIcon pref={m.pref} title={t.prefLong[m.pref]} />
                  </span>
                  <span className="rank-matches">{t.members.matchCount(m.matches)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {editing && <MemberForm member={editing === 'new' ? undefined : editing} name={editing === 'new' ? query : undefined} onClose={() => setEditing(null)} />}
    </div>
  );
}
