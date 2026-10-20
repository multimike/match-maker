// The player's phone (#/play, or #/join/<code> from the QR poster): join the club, say who you
// are, check in, and follow your court. Everything the player does is a request to the
// organiser's device (requests.ts); the screen follows the live view that comes back, and shows
// the player's own changes straight away while the organiser's device catches up.

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Court, Energy, Pref } from '../../engine/engine.ts';
import { isProvisional } from '../../engine/rating.ts';
import { ROLE_KEY } from '../cloud/context.ts';
import type { Cloud } from '../cloud/firebase.ts';
import { createPlayerClient, type PlayerClient, type PlayerState } from '../cloud/player.ts';
import { Avatar } from '../components/Avatar.tsx';
import { ScoreEntry } from '../components/CourtCard.tsx';
import { CourtView, type Tag } from '../components/CourtView.tsx';
import { PrefIcon } from '../components/PrefIcon.tsx';
import { Confetti, Shuttle } from '../components/Shuttle.tsx';
import { Field, Segmented, useConfirm } from '../components/ui.tsx';
import { formatDate, signed } from '../format.ts';
import { joinCodeOf, useNow } from '../hooks.ts';
import type { LiveCheckIn, LiveRound, LiveSession } from '../live.ts';
import { MAX_NAME, type CourtResult, type Group, type Member } from '../model.ts';
import { setPrefs, usePrefs, type Lang } from '../prefs.ts';
import { pickWinner, winnerFromScore } from '../results.ts';
import { newId } from '../store.ts';
import { useStrings } from '../strings.ts';
import { clock, remaining, timerPhase } from '../timer.ts';
import { ENERGY_EMOJI, REST_EMOJI, SKIP_EMOJI } from './Tonight.tsx';

/** The member id this phone just signed up as, until the organiser's device has added them. */
const SIGNED_UP_KEY = 'matchmaker.signedUp';

export function PlayScreen({ cloud }: { cloud: Cloud }) {
  const t = useStrings();
  // Read once: the code leaves the address bar after joining.
  const [code] = useState(() => joinCodeOf(location.hash));
  const [client, setClient] = useState<PlayerClient | null>(null);

  useEffect(() => {
    const created = createPlayerClient(cloud, code);
    setClient(created);
    if (code) history.replaceState(null, '', '#/play');
    if (localStorage.getItem(ROLE_KEY) !== 'organiser') localStorage.setItem(ROLE_KEY, 'player');
    return () => created.stop();
  }, [cloud, code]);

  useEffect(() => {
    document.title = t.appName;
  }, [t]);

  return (
    <div className="phone">
      <PhoneTop />
      <main className="phone-main">{client ? <PhoneBody client={client} /> : <Loading />}</main>
    </div>
  );
}

function PhoneTop() {
  const t = useStrings();
  const { lang } = usePrefs();
  return (
    <header className="phone-top">
      <span className="phone-brand">
        <Shuttle size={30} />
        {t.appName}
      </span>
      <div className="lang" role="radiogroup" aria-label={t.settings.language}>
        {(['sv', 'en'] as Lang[]).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} className="lang-option" title={t.languages[l]} onClick={() => setPrefs({ lang: l })}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}

function PhoneBody({ client }: { client: PlayerClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  if (state.phase === 'scan') return <Scan badCode={state.badCode} />;
  if (state.phase === 'error') return <Unreachable />;
  if (state.phase === 'starting' || !state.loaded) return <Loading />;
  const me = state.members.find((m) => m.id === state.memberId);
  if (!me) {
    if (state.memberId && sessionStorage.getItem(SIGNED_UP_KEY) === state.memberId) return <Waiting client={client} />;
    return <WhoAreYou client={client} members={state.members} />;
  }
  return <Home client={client} me={me} state={state} />;
}

function Loading() {
  return (
    <div className="phone-loading" aria-busy="true">
      <Shuttle size={64} className="bob" />
    </div>
  );
}

// ---- Before the player is known ----

function Scan({ badCode }: { badCode: boolean }) {
  const t = useStrings();
  return (
    <section className="phone-hero">
      <ScanArt />
      <h1 className="phone-title phone-title--big">{t.phone.scanTitle}</h1>
      <p className="phone-lead">{badCode ? t.phone.badCode : t.phone.scanLead}</p>
    </section>
  );
}

/** A phone with a QR code on its screen, and a shuttle on its way in. */
function ScanArt() {
  return (
    <div className="scan-art" aria-hidden="true">
      <svg viewBox="0 0 120 160" className="scan-phone">
        <rect x="7" y="5" width="106" height="150" rx="18" fill="none" stroke="currentColor" strokeWidth="6" />
        <rect x="47" y="14" width="26" height="5" rx="2.5" fill="currentColor" />
        <g fill="currentColor" fillRule="evenodd">
          <path d="M26 42h24v24H26zM30 46v16h16V46z" />
          <path d="M70 42h24v24H70zM74 46v16h16V46z" />
          <path d="M26 86h24v24H26zM30 90v16h16V90z" />
          <path d="M34 50h8v8h-8zM78 50h8v8h-8zM34 94h8v8h-8zM58 42h6v6h-6zM58 54h6v6h-6zM70 74h6v6h-6zM82 86h6v6h-6zM58 86h6v6h-6zM70 98h6v6h-6zM88 98h6v12h-6zM58 104h6v6h-6zM26 74h6v6h-6zM44 74h6v6h-6z" />
        </g>
      </svg>
      <Shuttle size={58} className="scan-shuttle" />
    </div>
  );
}

function Unreachable() {
  const t = useStrings();
  return (
    <section className="phone-hero">
      <Shuttle size={80} className="phone-hero-shuttle" />
      <h1 className="phone-title">{t.phone.errorTitle}</h1>
      <p className="phone-lead">{t.phone.errorLead}</p>
      <button type="button" className="button button--primary button--big" onClick={() => location.reload()}>
        {t.phone.retry}
      </button>
    </section>
  );
}

function WhoAreYou({ client, members }: { client: PlayerClient; members: Member[] }) {
  const t = useStrings();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<Member | 'new' | null>(null);
  if (step === 'new') return <NewPlayer client={client} name={query.trim()} onBack={() => setStep(null)} />;
  if (step) return <ThatsMe client={client} member={step} onBack={() => setStep(null)} />;

  const q = query.trim().toLowerCase();
  const shown = [...members].sort((a, b) => a.name.localeCompare(b.name, t.locale)).filter((m) => !q || m.name.toLowerCase().includes(q));
  return (
    <section className="phone-card">
      <h1 className="phone-title">{t.phone.whoTitle}</h1>
      <input className="input" type="search" placeholder={t.phone.search} aria-label={t.phone.search} value={query} onChange={(e) => setQuery(e.target.value)} />
      {shown.length > 0 && (
        <ul className="names" aria-label={t.phone.whoLead}>
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" className="name" onClick={() => setStep(m)}>
                <Avatar id={m.id} name={m.name} />
                <span className="name-text">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button button--quiet button--wide" onClick={() => setStep('new')}>
        {q ? t.phone.newNamed(query.trim()) : t.phone.imNew}
      </button>
    </section>
  );
}

function PrefChoice({ value, onChange }: { value: Pref; onChange: (pref: Pref) => void }) {
  const t = useStrings();
  return (
    <Field label={t.phone.prefers}>
      <Segmented
        label={t.phone.prefers}
        value={value}
        onChange={onChange}
        options={(['singles', 'either', 'doubles'] as Pref[]).map((p) => ({
          value: p,
          label: (
            <>
              <PrefIcon pref={p} /> {t.pref[p]}
            </>
          ),
        }))}
      />
    </Field>
  );
}

function Consent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const t = useStrings();
  return (
    <label className="toggle toggle--consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{t.phone.consent}</span>
    </label>
  );
}

/** An existing member on this phone for the first time. */
function ThatsMe({ client, member, onBack }: { client: PlayerClient; member: Member; onBack: () => void }) {
  const t = useStrings();
  const [pref, setPref] = useState<Pref>(member.pref);
  const needsConsent = member.consentAt === undefined;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await client.setMember(member.id);
      if (pref !== member.pref || needsConsent) {
        await client.send({
          type: 'profile',
          memberId: member.id,
          ...(pref !== member.pref ? { pref } : {}),
          ...(needsConsent ? { consent: true as const } : {}),
        });
      }
    } catch {
      setBusy(false);
    }
  };

  return (
    <section className="phone-card phone-card--center">
      <Avatar id={member.id} name={member.name} className="avatar--huge" />
      <h1 className="phone-title">{t.phone.hi(member.name)}</h1>
      <PrefChoice value={pref} onChange={setPref} />
      {needsConsent && <Consent checked={consent} onChange={setConsent} />}
      <button type="button" className="button button--primary button--big button--wide" disabled={busy || (needsConsent && !consent)} onClick={confirm}>
        {t.phone.thatsMe}
      </button>
      <button type="button" className="link-button" onClick={onBack}>
        {t.phone.back}
      </button>
    </section>
  );
}

function NewPlayer({ client, name: initialName, onBack }: { client: PlayerClient; name: string; onBack: () => void }) {
  const t = useStrings();
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState<Group | 0>(0);
  const [pref, setPref] = useState<Pref>('either');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = name.trim() !== '' && group !== 0 && consent && !busy;

  const join = async () => {
    if (!ready) return;
    setBusy(true);
    const id = newId();
    sessionStorage.setItem(SIGNED_UP_KEY, id);
    try {
      await client.setMember(id);
      await client.send({ type: 'signup', memberId: id, name: name.trim(), group, pref, consent: true });
    } catch {
      setBusy(false);
    }
  };

  return (
    <form
      className="phone-card"
      onSubmit={(e) => {
        e.preventDefault();
        void join();
      }}
    >
      <h1 className="phone-title">{t.phone.newTitle}</h1>
      <Field label={t.form.name} hint={t.phone.nameHint} htmlFor="new-player-name">
        <input id="new-player-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} autoComplete="given-name" required />
      </Field>
      <Field label={t.form.group} hint={t.phone.groupHint}>
        <Segmented<Group | 0>
          label={t.form.group}
          value={group}
          onChange={setGroup}
          options={[1, 2].map((g) => ({ value: g as Group, label: t.members.groupN(g) }))}
        />
      </Field>
      <PrefChoice value={pref} onChange={setPref} />
      <Consent checked={consent} onChange={setConsent} />
      <button type="submit" className="button button--primary button--big button--wide" disabled={!ready}>
        {t.phone.signUp}
      </button>
      <button type="button" className="link-button" onClick={onBack}>
        {t.phone.back}
      </button>
    </form>
  );
}

function Waiting({ client }: { client: PlayerClient }) {
  const t = useStrings();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(id);
  }, []);
  return (
    <section className="phone-hero">
      <Shuttle size={64} className="bob" />
      <h1 className="phone-title">{t.phone.waiting}</h1>
      {slow && <p className="phone-lead">{t.phone.waitingHint}</p>}
      <button
        type="button"
        className="link-button link-button--light"
        onClick={() => {
          sessionStorage.removeItem(SIGNED_UP_KEY);
          void client.setMember(null);
        }}
      >
        {t.phone.startOver}
      </button>
    </section>
  );
}

// ---- The player's evening ----

function Home({ client, me, state }: { client: PlayerClient; me: Member; state: PlayerState }) {
  const t = useStrings();
  const session = state.live.session;
  const checkIn = session?.checkIns[me.id];
  return (
    <>
      <MeCard client={client} me={me} members={state.members} checkIn={checkIn} />
      {!session ? (
        <NoEvening />
      ) : checkIn?.here ? (
        <>
          {session.friendly && <p className="phone-friendly phone-friendly--light">{t.phone.friendly}</p>}
          <RoundView client={client} me={me} round={session.round} members={state.members} />
          <TonightCard client={client} me={me} checkIn={checkIn} />
        </>
      ) : (
        <CheckIn client={client} me={me} session={session} left={checkIn !== undefined} />
      )}
    </>
  );
}

function MeCard({ client, me, members, checkIn }: { client: PlayerClient; me: Member; members: Member[]; checkIn?: LiveCheckIn }) {
  const t = useStrings();
  const rank = [...members].sort((a, b) => b.rating - a.rating).findIndex((m) => m.id === me.id) + 1;
  const tonight = checkIn ? me.rating - checkIn.startRating : 0;
  return (
    <header className="me">
      <Avatar id={me.id} name={me.name} className="avatar--big" />
      <div className="me-text">
        <p className="me-name">{me.name}</p>
        <p className="me-line">
          <span className="me-rating">{Math.round(me.rating)}</span>
          {isProvisional(me) && <span className="prov-tag">{t.members.provisional}</span>}
          <span>{t.phone.rank(rank, members.length)}</span>
          {Math.abs(tonight) >= 0.5 && <span className={`me-delta ${tonight > 0 ? 'is-up' : 'is-down'}`}>{t.phone.tonightChange(signed(tonight))}</span>}
        </p>
        {me.status === 'new' && <p className="me-new">{t.phone.isNew}</p>}
      </div>
      <button type="button" className="me-switch" onClick={() => void client.setMember(null)}>
        {t.phone.notYou}
      </button>
    </header>
  );
}

function NoEvening() {
  const t = useStrings();
  return (
    <section className="phone-hero">
      <Shuttle size={96} className="phone-hero-shuttle" />
      <h1 className="phone-title">{t.phone.noEvening}</h1>
      <p className="phone-lead">{t.phone.seeYou}</p>
    </section>
  );
}

function EnergyChoice({ value, onChange }: { value: Energy; onChange: (energy: Energy) => void }) {
  const t = useStrings();
  return (
    <div className="energy-choices" role="radiogroup" aria-label={t.tonight.energyTonight}>
      {(['challenge', 'normal', 'easy'] as Energy[]).map((e) => (
        <button key={e} type="button" role="radio" aria-checked={value === e} className="energy" onClick={() => onChange(e)}>
          <span className="energy-emoji" aria-hidden="true">{ENERGY_EMOJI[e]}</span>
          {t.energy[e]}
        </button>
      ))}
    </div>
  );
}

function CheckIn({ client, me, session, left }: { client: PlayerClient; me: Member; session: LiveSession; left: boolean }) {
  const t = useStrings();
  const [energy, setEnergy] = useState<Energy>('normal');
  const [restOk, setRestOk] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const now = useNow(sentAt !== null, 1000);

  const send = () => {
    setSentAt(Date.now());
    client.send({ type: 'checkIn', memberId: me.id, energy, restOk: energy === 'easy' && restOk }).catch(() => setSentAt(null));
  };

  return (
    <section className="phone-card">
      <h1 className="phone-title">{left ? t.phone.checkedOut : t.phone.tonightTitle}</h1>
      <p className="phone-date">{formatDate(t, session.date)}</p>
      {session.friendly && <p className="phone-friendly">{t.phone.friendly}</p>}
      <p className="field-label">{t.phone.feel}</p>
      <EnergyChoice value={energy} onChange={setEnergy} />
      {energy === 'easy' && (
        <label className="toggle">
          <input type="checkbox" checked={restOk} onChange={(e) => setRestOk(e.target.checked)} />
          <span>{REST_EMOJI} {t.restOk}</span>
        </label>
      )}
      <button type="button" className="button button--primary button--huge button--wide" disabled={sentAt !== null} onClick={send}>
        {sentAt !== null ? t.phone.checkingIn : left ? t.phone.checkInAgain : t.phone.imHere}
      </button>
      {sentAt !== null && now - sentAt > 10_000 && <p className="field-hint">{t.phone.waitingHint}</p>}
    </section>
  );
}

function RoundView({ client, me, round, members }: { client: PlayerClient; me: Member; round?: LiveRound; members: Member[] }) {
  const t = useStrings();
  if (!round) return <Hero title={t.phone.checkedIn} lead={t.phone.firstSoon} />;
  const index = round.courts.findIndex((c) => c.sides.flat().includes(me.id));
  if (round.status === 'done') return <RoundDone round={round} me={me} index={index} />;
  if (index < 0) {
    const resting = round.resting.includes(me.id);
    return <Hero icon={resting ? REST_EMOJI : undefined} title={resting ? t.phone.resting : t.phone.nextRound} lead={resting ? t.phone.restingHint : t.round(round.number + 1)} />;
  }
  return <CourtTicket key={round.id} client={client} me={me} round={round} index={index} members={members} />;
}

function Hero({ icon, title, lead }: { icon?: string; title: string; lead: string }) {
  return (
    <section className="phone-hero phone-hero--small">
      {icon ? <span className="phone-hero-icon" aria-hidden="true">{icon}</span> : <Shuttle size={72} className="phone-hero-shuttle" />}
      <h1 className="phone-title">{title}</h1>
      <p className="phone-lead">{lead}</p>
    </section>
  );
}

/** The player's court: the court number big, the court from above, and who won. */
function CourtTicket({ client, me, round, index, members }: { client: PlayerClient; me: Member; round: LiveRound; index: number; members: Member[] }) {
  const t = useStrings();
  const court: Court = round.courts[index];
  const playing = round.status === 'playing';
  const now = useNow(playing, 500);
  const phase = playing ? timerPhase(round.timer, now) : 'ready';
  const names = new Map(members.map((m) => [m.id, m.name]));
  const sides = court.sides.map((side) =>
    side.map((id) => ({ id, name: names.get(id) ?? t.removed, note: id === me.id ? t.phone.you : undefined }))) as [Tag[], Tag[]];

  // What this phone sent shows until the live view changes (the organiser's device has it).
  const live = round.results[index] ?? { winner: null };
  const key = JSON.stringify(live);
  const [sent, setSent] = useState<{ key: string; result: CourtResult } | null>(null);
  const result = sent?.key === key ? sent.result : live;
  const send = (next: CourtResult) => {
    setSent({ key, result: next });
    void client.send({ type: 'result', memberId: me.id, roundId: round.id, court: index, winner: next.winner, ...(next.score ? { score: next.score } : {}) });
  };
  const level = !!result.score && winnerFromScore(result.score) === null && result.winner === null;

  const status = !playing
    ? t.phone.mayChange
    : phase === 'over' ? t.rounds.buzzerRule : phase === 'warning' ? t.rounds.lastMinute : phase === 'paused' ? t.rounds.paused : '';

  return (
    <section className="ticket" data-phase={phase} aria-label={t.phone.yourCourt(index + 1)}>
      <header className="ticket-head">
        <span className="ticket-number" aria-hidden="true">{index + 1}</span>
        <div className="ticket-titles">
          <h1 className="ticket-title">{t.court(index + 1)}</h1>
          <p className="ticket-sub">
            <span>{playing ? t.round(round.number) : t.phone.upNext(round.number)}</span>
            <span className="ticket-type">{t.type[court.type]}</span>
          </p>
        </div>
        {playing && (
          <span className="ticket-clock" role="timer">
            {phase === 'over' ? t.rounds.timeUp : clock(remaining(round.timer, now))}
          </span>
        )}
      </header>
      {status && <p className="ticket-status">{status}</p>}
      <CourtView
        type={court.type}
        sides={sides}
        result={result}
        winLabel={t.rounds.win}
        mine={court.sides[0].includes(me.id) ? 0 : 1}
        invite={level}
        onPick={playing ? (side) => send(pickWinner(result, side)) : undefined}
      />
      {playing && (
        <div className="ticket-result">
          <p className="ticket-result-hint">{t.phone.whoWon}</p>
          <ScoreEntry result={result} onResult={send} level={level} />
        </div>
      )}
    </section>
  );
}

function RoundDone({ round, me, index }: { round: LiveRound; me: Member; index: number }) {
  const t = useStrings();
  const court = round.courts[index];
  if (!court) return <Hero icon={REST_EMOJI} title={t.rounds.roundDone(round.number)} lead={t.phone.nextSoon} />;
  const winner = round.results[index]?.winner ?? null;
  const won = winner !== null && court.sides[winner].includes(me.id);
  const change = round.changes?.[me.id];
  return (
    <section className="phone-hero phone-hero--done" data-won={won || undefined}>
      {won && <Confetti key={round.id} />}
      <Shuttle size={72} className="phone-hero-shuttle" />
      <h1 className="phone-title phone-title--big">{winner === null ? t.phone.noResult : won ? t.phone.won : t.phone.lost}</h1>
      {change !== undefined && Math.abs(change) >= 0.5 && (
        <p className={`phone-change ${change > 0 ? 'is-up' : 'is-down'}`}>{t.phone.ratingChange(signed(change))}</p>
      )}
      <p className="phone-lead">
        {t.rounds.roundDone(round.number)} {t.phone.nextSoon}
      </p>
    </section>
  );
}

type Tweak = Partial<Pick<LiveCheckIn, 'energy' | 'restOk' | 'skip'>>;

function TonightCard({ client, me, checkIn }: { client: PlayerClient; me: Member; checkIn: LiveCheckIn }) {
  const t = useStrings();
  const confirm = useConfirm();
  // Changes show straight away; each is dropped once the live view says the same.
  const [pending, setPending] = useState<Tweak>({});
  useEffect(() => {
    setPending((p) => {
      const left = Object.fromEntries(Object.entries(p).filter(([k, v]) => checkIn[k as keyof Tweak] !== v));
      return Object.keys(left).length === Object.keys(p).length ? p : left;
    });
  }, [checkIn]);
  const shown = { ...checkIn, ...pending };
  const update = (change: Tweak) => {
    setPending((p) => ({ ...p, ...change }));
    void client.send({ type: 'update', memberId: me.id, ...change });
  };

  return (
    <section className="phone-card">
      <h2 className="phone-card-title">{t.phone.tonight}</h2>
      <EnergyChoice value={shown.energy} onChange={(energy) => update(energy === 'easy' ? { energy } : { energy, restOk: false })} />
      {shown.energy === 'easy' && (
        <label className="toggle">
          <input type="checkbox" checked={shown.restOk} onChange={(e) => update({ restOk: e.target.checked })} />
          <span>{REST_EMOJI} {t.restOk}</span>
        </label>
      )}
      <label className="toggle">
        <input type="checkbox" checked={shown.skip} onChange={(e) => update({ skip: e.target.checked })} />
        <span>{SKIP_EMOJI} {t.skip}</span>
      </label>
      <button
        type="button"
        className="button button--danger-quiet phone-checkout"
        onClick={async () => {
          if (await confirm({ ...t.phone.checkOutConfirm, ok: t.phone.checkOut, danger: false })) void client.send({ type: 'checkOut', memberId: me.id });
        }}
      >
        {t.phone.checkOut}
      </button>
    </section>
  );
}
