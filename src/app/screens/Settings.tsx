// Settings. With the cloud set up: the links for players' phones and the TV, and who the
// organisers are. Always: the training groups, this device's language and sound, the backup,
// and, last, the things that can't be undone.

import { useId, useRef, useState, type ReactNode } from 'react';
import { joinLink, tvLink, useCloud, type CloudInfo } from '../cloud/context.ts';
import { QrCode } from '../components/QrCode.tsx';
import { CopyButton, Dialog, Field, Section, Segmented, SettingRow, Stepper, useConfirm } from '../components/ui.tsx';
import { groupName } from '../format.ts';
import { routeHref } from '../hooks.ts';
import { GROUP_START, emptyState, type TrainingGroup } from '../model.ts';
import { setPrefs, usePrefs, type Lang } from '../prefs.ts';
import { play, unlockAudio } from '../sound.ts';
import { backupFileName, parseState } from '../storage.ts';
import { useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';

export function Settings({ onClose }: { onClose: () => void }) {
  const t = useStrings();
  const cloud = useCloud();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.settings.title}
      footer={
        <button type="button" className="button button--primary" onClick={onClose}>
          {t.done}
        </button>
      }
    >
      {cloud && <InTheHall cloud={cloud} onClose={onClose} />}
      {cloud && <Organisers cloud={cloud} />}
      <Groups />
      <ThisDevice cloud={cloud} />
      <Backup />
      <CantBeUndone cloud={cloud} onClose={onClose} />
    </Dialog>
  );
}

/** A QR code and its link, with what to do with it. The poster's and the TV's look the same. */
function LinkCard({ title, hint, link, children }: { title: string; hint: string; link: string; children: ReactNode }) {
  return (
    <div className="link-card">
      <QrCode text={link} className="link-card-qr" label={title} />
      <div className="link-card-text">
        <span className="setting-label">{title}</span>
        <span className="setting-hint">{hint}</span>
        <span className="link-card-url">{link}</span>
      </div>
      <div className="link-card-actions">{children}</div>
    </div>
  );
}

function InTheHall({ cloud, onClose }: { cloud: CloudInfo; onClose: () => void }) {
  const t = useStrings();
  const join = joinLink(cloud.joinCode);
  const tv = tvLink(cloud.joinCode);
  return (
    <Section title={t.settings.inHall}>
      <LinkCard title={t.cloud.phones} hint={t.cloud.phonesHint} link={join}>
        <a className="button button--primary" href={routeHref('poster')} onClick={onClose}>
          {t.cloud.poster}
        </a>
        <CopyButton text={join} label={t.cloud.copyLink} />
      </LinkCard>
      <LinkCard title={t.cloud.tvTitle} hint={t.cloud.tvHint} link={tv}>
        <CopyButton text={tv} label={t.cloud.copyTvLink} />
      </LinkCard>
    </Section>
  );
}

function Organisers({ cloud }: { cloud: CloudInfo }) {
  const t = useStrings();
  const confirm = useConfirm();
  const [email, setEmail] = useState('');
  const address = email.trim().toLowerCase();
  const add = () => {
    if (!address.includes('@') || cloud.organisers.includes(address)) return;
    void cloud.setOrganisers([...cloud.organisers, address]).then(() => setEmail(''));
  };
  return (
    <Section title={t.cloud.organisers} hint={t.cloud.organisersHint}>
      <ul className="list">
        {cloud.organisers.map((o) => (
          <li key={o} className="list-row">
            <span className="list-main">{o}</span>
            {o === cloud.owner && <span className="chip chip--small">{t.cloud.owner}</span>}
            {o === cloud.email && <span className="chip chip--small">{t.cloud.you}</span>}
            {o !== cloud.owner && (
              <button
                type="button"
                className="button button--danger-quiet button--small list-end"
                onClick={async () => {
                  if (await confirm({ ...t.cloud.removeConfirm(o), ok: t.cloud.removeOrganiser })) void cloud.setOrganisers(cloud.organisers.filter((x) => x !== o));
                }}
              >
                {t.cloud.removeOrganiser}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" type="email" placeholder={t.cloud.organiserEmail} aria-label={t.cloud.organiserEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="button button--quiet" disabled={!address.includes('@')}>
          {t.cloud.addOrganiser}
        </button>
      </form>
    </Section>
  );
}

function Groups() {
  const t = useStrings();
  const { groups, members } = useAppState();
  const [editing, setEditing] = useState<TrainingGroup | 'new' | null>(null);
  return (
    <Section title={t.groups.title} hint={t.groups.hint}>
      <ul className="list">
        {groups.map((g) => (
          <li key={g.id} className="list-row">
            <span className="list-main">{groupName(t, g)}</span>
            <span className="chip chip--small">{t.groups.startChip(g.start)}</span>
            {g.hideRating && <span className="chip chip--small">{t.groups.hidden}</span>}
            <span className="setting-hint">{t.groups.players(members.filter((m) => m.group === g.id).length)}</span>
            <button type="button" className="button button--quiet button--small list-end" onClick={() => setEditing(g)}>
              {t.groups.edit}
            </button>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button type="button" className="button button--quiet" onClick={() => setEditing('new')}>
          {t.groups.add}
        </button>
      </div>
      {editing && <GroupForm group={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

/** Adding or changing a training group; deleting one moves its players to another group. */
function GroupForm({ group, onClose }: { group?: TrainingGroup; onClose: () => void }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const { groups, members } = useAppState();
  const [name, setName] = useState(group?.name ?? '');
  const [start, setStart] = useState(group?.start ?? 1400);
  const [hideRating, setHideRating] = useState(group?.hideRating ?? false);
  const others = groups.filter((g) => g.id !== group?.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? 0);
  const players = group ? members.filter((m) => m.group === group.id).length : 0;
  const formId = useId();
  // The two groups every club starts with have a name in each language until someone gives them one.
  const placeholder = group && !group.name ? t.members.groupN(group.id) : t.groups.namePlaceholder;
  const nameNeeded = !group || group.name !== '';
  const ready = !nameNeeded || name.trim() !== '';

  const submit = () => {
    if (!ready) return;
    const input = { name, start, hideRating };
    dispatch(group ? { type: 'group/update', id: group.id, group: input } : { type: 'group/add', group: input });
    onClose();
  };

  const remove = async () => {
    if (!group || others.length === 0) return;
    const to = groupName(t, others.find((g) => g.id === moveTo));
    if (await confirm({ ...t.groups.deleteConfirm(groupName(t, group), players, to), ok: t.groups.delete })) {
      dispatch({ type: 'group/delete', id: group.id, moveTo });
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? t.groups.editTitle : t.groups.newTitle}
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" form={formId} className="button button--primary" disabled={!ready}>
            {group ? t.save : t.form.add}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t.groups.name} htmlFor={`${formId}-name`}>
          <input id={`${formId}-name`} className="input" value={name} placeholder={placeholder} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" required={nameNeeded} data-autofocus={group ? undefined : true} />
        </Field>
        <Field label={t.groups.start} hint={t.groups.startHint}>
          <Stepper label={t.groups.start} value={start} min={GROUP_START.min} max={GROUP_START.max} step={GROUP_START.step} onChange={setStart} />
        </Field>
        <div className="field">
          <label className="toggle">
            <input type="checkbox" checked={hideRating} onChange={(e) => setHideRating(e.target.checked)} />
            <span>{t.groups.hide}</span>
          </label>
          <span className="field-hint">{t.groups.hideHint}</span>
        </div>
      </form>
      {group && others.length > 0 && (
        <Section title={t.settings.danger} danger>
          {players > 0 && (
            <Field label={t.groups.moveTo} htmlFor={`${formId}-move`}>
              <select id={`${formId}-move`} className="input" value={moveTo} onChange={(e) => setMoveTo(Number(e.target.value))}>
                {others.map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupName(t, g)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <SettingRow label={t.groups.delete} hint={t.groups.deleteHint(players)}>
            <button type="button" className="button button--danger-quiet" onClick={() => void remove()}>
              {t.settings.deleteButton}
            </button>
          </SettingRow>
        </Section>
      )}
    </Dialog>
  );
}

function ThisDevice({ cloud }: { cloud: CloudInfo | null }) {
  const t = useStrings();
  const prefs = usePrefs();
  return (
    <Section title={t.settings.device}>
      <SettingRow label={t.settings.language}>
        <Segmented label={t.settings.language} value={prefs.lang} onChange={(lang: Lang) => setPrefs({ lang })} options={(['sv', 'en'] as Lang[]).map((l) => ({ value: l, label: t.languages[l] }))} />
      </SettingRow>
      <SettingRow label={t.settings.sound} hint={t.settings.soundHint}>
        <Segmented label={t.settings.sound} value={prefs.sound} onChange={(sound) => setPrefs({ sound })} options={[{ value: true, label: t.settings.on }, { value: false, label: t.settings.off }]} />
        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            unlockAudio();
            play('buzzer');
          }}
        >
          {t.settings.test}
        </button>
      </SettingRow>
      {cloud && (
        <SettingRow label={t.cloud.signedInAs(cloud.email)}>
          <button type="button" className="button button--quiet" onClick={() => void cloud.signOut()}>
            {t.cloud.signOut}
          </button>
        </SettingRow>
      )}
    </Section>
  );
}

function Backup() {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const cloud = useCloud();
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(Date.now());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const restore = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const backup = parseState(await picked.text());
      if (await confirm({ ...t.settings.restoreConfirm, ok: t.settings.restore })) {
        dispatch({ type: 'state/replace', state: backup });
        setMessage(t.settings.restored);
      }
    } catch {
      setMessage(t.settings.restoreFailed);
    }
    if (file.current) file.current.value = '';
  };

  return (
    <Section title={t.settings.backup} hint={cloud ? t.cloud.backupHint : t.settings.backupHint}>
      <div className="button-row">
        <button type="button" className="button button--quiet" onClick={download}>
          {t.settings.download}
        </button>
        <button type="button" className="button button--quiet" onClick={() => file.current?.click()}>
          {t.settings.restore}
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
      </div>
      {message && (
        <p className="setting-hint" role="status">
          {message}
        </p>
      )}
    </Section>
  );
}

function CantBeUndone({ cloud, onClose }: { cloud: CloudInfo | null; onClose: () => void }) {
  const t = useStrings();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  return (
    <Section title={t.settings.danger} danger>
      {cloud && (
        <SettingRow label={t.cloud.newCode} hint={t.cloud.newCodeHint}>
          <button
            type="button"
            className="button button--danger-quiet"
            onClick={async () => {
              if (await confirm({ ...t.cloud.newCodeConfirm, ok: t.cloud.newCode })) await cloud.replaceJoinCode();
            }}
          >
            {t.settings.replaceButton}
          </button>
        </SettingRow>
      )}
      <SettingRow label={t.settings.wipe} hint={cloud ? t.cloud.wipeHint : t.settings.wipeHint}>
        <button
          type="button"
          className="button button--danger-quiet"
          onClick={async () => {
            if (await confirm({ ...(cloud ? t.cloud.wipeConfirm : t.settings.wipeConfirm), ok: t.settings.wipe })) {
              dispatch({ type: 'state/replace', state: emptyState() });
              onClose();
            }
          }}
        >
          {t.settings.deleteButton}
        </button>
      </SettingRow>
    </Section>
  );
}
