// Tonight: open a match night, then check players in and out with their energy for the night.

import { useState } from 'react';
import type { Energy } from '../../engine/engine.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Dialog, Field, Segmented, SettingRow, Stepper, useConfirm } from '../components/ui.tsx';
import { capacityLines, formatDate } from '../format.ts';
import { go, useNow } from '../hooks.ts';
import {
  DEFAULT_COURTS,
  MAX_COURTS,
  ROUND_MINUTES,
  capacity,
  isHere,
  latestRound,
  localDate,
  openSession,
  type Member,
  type Session,
} from '../model.ts';
import { useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';
import { clock, remaining } from '../timer.ts';
import { MemberForm } from './MemberForm.tsx';

export const ENERGY_EMOJI: Record<Energy, string> = { challenge: '💪', normal: '⚖️', easy: '😌' };
export const REST_EMOJI = '💤';
export const SKIP_EMOJI = '⏸️';

export function Tonight() {
  const state = useAppState();
  const session = openSession(state);
  return session ? <OpenEvening session={session} /> : <OpenForm />;
}

function OpenForm() {
  const t = useStrings();
  const dispatch = useDispatch();
  const { sessions } = useAppState();
  const last = sessions[sessions.length - 1];
  const [courts, setCourts] = useState(last?.courts ?? DEFAULT_COURTS);
  const [minutes, setMinutes] = useState(last?.roundMinutes ?? ROUND_MINUTES.default);
  const [limit, setLimit] = useState(last?.softLimit ? String(last.softLimit) : '');
  const [friendly, setFriendly] = useState(false);
  const past = sessions.filter((s) => s.state === 'closed').slice(-6).reverse();

  return (
    <div className="page page--narrow">
      <form
        className="open-card"
        onSubmit={(e) => {
          e.preventDefault();
          const softLimit = Number.parseInt(limit, 10);
          dispatch({ type: 'session/open', courts, roundMinutes: minutes, softLimit: softLimit > 0 ? softLimit : undefined, friendly });
        }}
      >
        <h1 className="open-title">{t.open.title}</h1>
        <p className="page-lead">{t.open.lead}</p>
        <div className="open-fields">
          <Field label={t.open.kind} hint={friendly ? t.open.friendlyHint : t.open.ratedHint}>
            <Segmented label={t.open.kind} value={friendly} onChange={setFriendly} options={[{ value: false, label: t.open.rated }, { value: true, label: t.open.friendly }]} />
          </Field>
          <Field label={t.open.courts}>
            <Stepper label={t.open.courts} value={courts} min={1} max={MAX_COURTS} onChange={setCourts} />
          </Field>
          <Field label={t.open.roundLength}>
            <Stepper label={t.open.roundLength} value={minutes} min={ROUND_MINUTES.min} max={ROUND_MINUTES.max} unit={t.min} onChange={setMinutes} />
          </Field>
          <Field label={t.open.softLimit} hint={t.open.softLimitHint} htmlFor="open-soft-limit">
            <input id="open-soft-limit" className="input input--number" type="number" inputMode="numeric" min={2} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="–" />
          </Field>
        </div>
        <button type="submit" className="button button--primary button--big">
          {t.open.submit}
        </button>
      </form>

      {past.length > 0 && (
        <section className="past">
          <h2 className="section-title">{t.open.past}</h2>
          <ul className="past-list">
            {past.map((s) => (
              <li key={s.id}>
                <span className="past-date">{formatDate(t, s.date)}</span>
                <span className="past-line">
                  {t.open.pastLine(Object.keys(s.checkIns).length, s.rounds.length)}
                  {s.friendly && <span className="chip chip--small">{t.open.friendly}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type Filter = 'all' | 'here' | 'away';

function OpenEvening({ session }: { session: Session }) {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [settings, setSettings] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);

  const here = state.members.filter((m) => isHere(session.checkIns[m.id]));
  const skipping = here.filter((m) => session.checkIns[m.id].skip).length;
  const cap = capacity(here.length, skipping, session.courts, session.softLimit);
  const stale = session.date !== localDate(Date.now()) && !staleDismissed;

  const q = query.trim().toLowerCase();
  const tiles = [...state.members]
    .sort((a, b) => a.name.localeCompare(b.name, t.locale))
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .filter((m) => filter === 'all' || (filter === 'here') === isHere(session.checkIns[m.id]));

  const tap = (m: Member) => {
    if (isHere(session.checkIns[m.id])) setSheet(m.id);
    else dispatch({ type: 'checkIn', memberId: m.id });
  };

  const endEvening = async () => {
    if (await confirm({ ...t.tonight.endConfirm, ok: t.tonight.end, danger: false })) dispatch({ type: 'session/close' });
  };

  const sheetMember = sheet ? state.members.find((m) => m.id === sheet) : undefined;

  return (
    <div className="page">
      {stale && (
        <div className="notice">
          <span>{t.open.stale(formatDate(t, session.date))}</span>
          <button type="button" className="button button--quiet" onClick={() => setStaleDismissed(true)}>
            {t.open.keepStale}
          </button>
          <button type="button" className="button button--primary" onClick={endEvening}>
            {t.open.closeStale}
          </button>
        </div>
      )}

      <header className="page-head">
        <div>
          <h1 className="page-title">{t.tonight.title(formatDate(t, session.date))}</h1>
          <p className="chips">
            {session.friendly && <span className="chip chip--friendly">{t.open.friendly}</span>}
            <span className="chip">{t.courts(session.courts)}</span>
            <span className="chip">{t.minutes(session.roundMinutes)}</span>
            <button type="button" className="chip chip--button" onClick={() => setSettings(true)}>
              {t.tonight.settings}
            </button>
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button--quiet" onClick={endEvening}>
            {t.tonight.end}
          </button>
        </div>
      </header>

      <div className="tonight">
        <section className="checkin" aria-label={t.nav.tonight}>
          <div className="checkin-tools">
            <input className="input input--search" type="search" placeholder={t.tonight.search} aria-label={t.tonight.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Segmented
              label={t.tonight.show}
              value={filter}
              onChange={setFilter}
              options={(['all', 'here', 'away'] as Filter[]).map((f) => ({ value: f, label: t.tonight.filter[f] }))}
            />
          </div>
          <p className="checkin-hint">{t.tonight.tapToCheckIn}</p>
          <ul className="tiles">
            {tiles.map((m) => {
              const c = session.checkIns[m.id];
              const status = isHere(c) ? 'here' : c ? 'left' : 'away';
              return (
                <li key={m.id}>
                  <button type="button" className="tile" data-status={status} aria-label={`${m.name}, ${t.tonight.status[status]}`} onClick={() => tap(m)}>
                    <Avatar id={m.id} name={m.name} />
                    <span className="tile-name">{m.name}</span>
                    <span className="tile-badges">
                      {status === 'left' && <span className="tile-left">{t.tonight.left}</span>}
                      {isHere(c) && c.energy !== 'normal' && <span title={t.energy[c.energy]}>{ENERGY_EMOJI[c.energy]}</span>}
                      {isHere(c) && c.restOk && <span title={t.restOk}>{REST_EMOJI}</span>}
                      {isHere(c) && c.skip && <span title={t.skip}>{SKIP_EMOJI}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {q && tiles.length === 0 && (
              <li className="tiles-none">
                <span>{t.tonight.noMatch(query.trim())}</span>
              </li>
            )}
            <li>
              <button type="button" className="tile tile--add" onClick={() => setAdding(query.trim())}>
                <span className="tile-plus" aria-hidden="true">+</span>
                <span className="tile-name">{q ? t.tonight.addNamed(query.trim()) : t.tonight.newPlayer}</span>
              </button>
            </li>
          </ul>
        </section>

        <aside className="evening-panel">
          <p className="here-count">
            <span className="here-number">{here.length}</span>
            <span className="here-label">{t.tonight.hereLabel}</span>
          </p>
          <ul className="capacity">
            {capacityLines(t, cap, session.courts, session.softLimit).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <RoundStatus session={session} canPlan={cap.playing >= 2} />
        </aside>
      </div>

      {sheetMember && <PlayerSheet member={sheetMember} session={session} onClose={() => setSheet(null)} onEdit={() => { setSheet(null); setEditing(sheetMember); }} />}
      {adding !== null && (
        <MemberForm
          name={adding}
          onClose={() => setAdding(null)}
          onAdded={(id) => {
            dispatch({ type: 'checkIn', memberId: id });
            setQuery('');
          }}
        />
      )}
      {editing && <MemberForm member={editing} onClose={() => setEditing(null)} />}
      {settings && <EveningSettings session={session} onClose={() => setSettings(false)} />}
    </div>
  );
}

/** The round's state, and the way there. */
function RoundStatus({ session, canPlan }: { session: Session; canPlan: boolean }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const round = latestRound(session);
  const playing = round?.status === 'playing';
  const now = useNow(playing, 1000);
  if (round && round.status !== 'done') {
    return (
      <div className="round-status">
        <p className="round-status-line">
          <span className="round-status-title">{t.round(round.number)}</span>
          {playing ? <span className="round-status-clock">{clock(remaining(round.timer, now))}</span> : <span>{t.rounds.planned}</span>}
        </p>
        <button type="button" className="button button--primary button--wide" onClick={() => go('round')}>
          {t.tonight.goToRound}
        </button>
      </div>
    );
  }
  const next = (round?.number ?? 0) + 1;
  return (
    <div className="round-status">
      <button
        type="button"
        className="button button--primary button--big button--wide"
        disabled={!canPlan}
        onClick={() => {
          dispatch({ type: 'round/plan' });
          go('round');
        }}
      >
        {t.rounds.make(next)}
      </button>
      <p className="round-status-hint">{t.rounds.makeHint}</p>
    </div>
  );
}

function PlayerSheet({ member, session, onClose, onEdit }: { member: Member; session: Session; onClose: () => void; onEdit: () => void }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const c = session.checkIns[member.id];
  if (!isHere(c)) return null;
  const update = (change: { energy?: Energy; restOk?: boolean; skip?: boolean }) => dispatch({ type: 'checkIn/update', memberId: member.id, ...change });
  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name}
      variant="sheet"
      media={<Avatar id={member.id} name={member.name} className="avatar--big" />}
      footer={
        <button type="button" className="button button--primary" onClick={onClose}>
          {t.done}
        </button>
      }
    >
      <Field label={t.tonight.energyTonight}>
        <div className="energy-choices" role="radiogroup" aria-label={t.tonight.energyTonight}>
          {(['challenge', 'normal', 'easy'] as Energy[]).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={c.energy === e} className="energy" onClick={() => update({ energy: e })}>
              <span className="energy-emoji" aria-hidden="true">{ENERGY_EMOJI[e]}</span>
              {t.energy[e]}
            </button>
          ))}
        </div>
      </Field>
      <div className="toggles">
        {c.energy === 'easy' && (
          <label className="toggle">
            <input type="checkbox" checked={c.restOk} onChange={(e) => update({ restOk: e.target.checked })} />
            <span>{REST_EMOJI} {t.restOk}</span>
          </label>
        )}
        <label className="toggle">
          <input type="checkbox" checked={c.skip} onChange={(e) => update({ skip: e.target.checked })} />
          <span>{SKIP_EMOJI} {t.skip}</span>
        </label>
      </div>
      <div className="dialog-more">
        <button type="button" className="button button--quiet" onClick={onEdit}>
          {t.tonight.editMember}
        </button>
        <button
          type="button"
          className="button button--danger-quiet"
          onClick={() => {
            dispatch({ type: 'checkOut', memberId: member.id });
            onClose();
          }}
        >
          {t.tonight.checkOut}
        </button>
      </div>
    </Dialog>
  );
}

function EveningSettings({ session, onClose }: { session: Session; onClose: () => void }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const [limit, setLimit] = useState(session.softLimit ? String(session.softLimit) : '');
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.tonight.settingsTitle}
      lead={t.tonight.settingsHint}
      footer={
        <button type="button" className="button button--primary" onClick={onClose}>
          {t.done}
        </button>
      }
    >
      <SettingRow label={t.open.courts}>
        <Stepper label={t.open.courts} value={session.courts} min={1} max={MAX_COURTS} onChange={(courts) => dispatch({ type: 'session/update', courts })} />
      </SettingRow>
      <SettingRow label={t.open.roundLength}>
        <Stepper
          label={t.open.roundLength}
          value={session.roundMinutes}
          min={ROUND_MINUTES.min}
          max={Math.max(ROUND_MINUTES.max, session.roundMinutes)}
          unit={t.min}
          onChange={(roundMinutes) => dispatch({ type: 'session/update', roundMinutes })}
        />
      </SettingRow>
      <SettingRow label={t.open.softLimit} hint={t.open.softLimitHint} htmlFor="evening-soft-limit">
        <input
          id="evening-soft-limit"
          className="input input--number"
          type="number"
          inputMode="numeric"
          min={2}
          placeholder="–"
          value={limit}
          onChange={(e) => {
            setLimit(e.target.value);
            const softLimit = Number.parseInt(e.target.value, 10);
            dispatch({ type: 'session/update', softLimit: softLimit > 0 ? softLimit : null });
          }}
        />
      </SettingRow>
    </Dialog>
  );
}
