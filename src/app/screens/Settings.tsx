// Device settings and the data's safety net: language, sound, backup and restore. With the cloud
// set up, also the players' phones (QR code, poster) and who the organisers are.

import { useRef, useState } from 'react';
import { joinLink, tvLink, useCloud, type CloudInfo } from '../cloud/context.ts';
import { QrCode } from '../components/QrCode.tsx';
import { Dialog, Segmented, useConfirm } from '../components/ui.tsx';
import { routeHref } from '../hooks.ts';
import { emptyState } from '../model.ts';
import { setPrefs, usePrefs, type Lang } from '../prefs.ts';
import { play, unlockAudio } from '../sound.ts';
import { backupFileName, parseState } from '../storage.ts';
import { useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';

export function Settings({ onClose }: { onClose: () => void }) {
  const t = useStrings();
  const prefs = usePrefs();
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
      if (await confirm(t.settings.restoreConfirm, t.settings.restore)) {
        dispatch({ type: 'state/replace', state: backup });
        setMessage(t.settings.restored);
      }
    } catch {
      setMessage(t.settings.restoreFailed);
    }
    if (file.current) file.current.value = '';
  };

  return (
    <Dialog open onClose={onClose} title={t.settings.title} className="dialog--form">
      {cloud && <Phones cloud={cloud} onClose={onClose} />}
      {cloud && <TvLinkField cloud={cloud} />}
      {cloud && <Organisers cloud={cloud} />}

      <div className="field">
        <span className="field-label">{t.settings.language}</span>
        <Segmented label={t.settings.language} value={prefs.lang} onChange={(lang: Lang) => setPrefs({ lang })} options={(['sv', 'en'] as Lang[]).map((l) => ({ value: l, label: t.languages[l] }))} />
      </div>

      <div className="field">
        <span className="field-label">{t.settings.sound}</span>
        <div className="row">
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
        </div>
        <span className="field-hint">{t.settings.soundHint}</span>
      </div>

      <div className="field">
        <span className="field-label">{t.settings.backup}</span>
        <span className="field-hint">{cloud ? t.cloud.backupHint : t.settings.backupHint}</span>
        <div className="row">
          <button type="button" className="button button--quiet" onClick={download}>
            {t.settings.download}
          </button>
          <button type="button" className="button button--quiet" onClick={() => file.current?.click()}>
            {t.settings.restore}
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </div>
        {message && <p className="field-hint" role="status">{message}</p>}
      </div>

      <div className="dialog-actions">
        <button
          type="button"
          className="button button--danger-quiet dialog-actions-start"
          onClick={async () => {
            if (await confirm(cloud ? t.cloud.wipeConfirm : t.settings.wipeConfirm, t.settings.wipe)) {
              dispatch({ type: 'state/replace', state: emptyState() });
              onClose();
            }
          }}
        >
          {t.settings.wipe}
        </button>
        {cloud && (
          <button type="button" className="button button--quiet" title={t.cloud.signedInAs(cloud.email)} onClick={() => void cloud.signOut()}>
            {t.cloud.signOut}
          </button>
        )}
        <button type="button" className="button button--primary" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </Dialog>
  );
}

/** The QR code players scan, the poster, and a new code if the old one has spread too far. */
function Phones({ cloud, onClose }: { cloud: CloudInfo; onClose: () => void }) {
  const t = useStrings();
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const link = joinLink(cloud.joinCode);
  return (
    <div className="field">
      <span className="field-label">{t.cloud.phones}</span>
      <span className="field-hint">{t.cloud.phonesHint}</span>
      <div className="phones">
        <QrCode text={link} className="phones-qr" label={t.cloud.phones} />
        <div className="phones-actions">
          <a className="button button--primary" href={routeHref('poster')} onClick={onClose}>
            {t.cloud.poster}
          </a>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? t.cloud.copied : t.cloud.copyLink}
          </button>
          <button
            type="button"
            className="button button--danger-quiet"
            onClick={async () => {
              if (await confirm(t.cloud.newCodeConfirm, t.cloud.newCode)) {
                await cloud.replaceJoinCode();
                setCopied(false);
              }
            }}
          >
            {t.cloud.newCode}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The link for a device of its own at the TV: shows the courts, no sign-in. */
function TvLinkField({ cloud }: { cloud: CloudInfo }) {
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  const link = tvLink(cloud.joinCode);
  return (
    <div className="field">
      <span className="field-label">{t.cloud.tvTitle}</span>
      <span className="field-hint">{t.cloud.tvHint}</span>
      <div className="phones">
        <QrCode text={link} className="phones-qr phones-qr--small" label={t.cloud.tvTitle} />
        <div className="phones-actions">
          <span className="tv-link">{link}</span>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? t.cloud.copied : t.cloud.copyTvLink}
          </button>
        </div>
      </div>
    </div>
  );
}

function Organisers({ cloud }: { cloud: CloudInfo }) {
  const t = useStrings();
  const confirm = useConfirm();
  const [email, setEmail] = useState('');
  const add = () => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@') || cloud.organisers.includes(address)) return;
    void cloud.setOrganisers([...cloud.organisers, address]).then(() => setEmail(''));
  };
  return (
    <div className="field">
      <span className="field-label">{t.cloud.organisers}</span>
      <span className="field-hint">{t.cloud.organisersHint}</span>
      <ul className="organisers">
        {cloud.organisers.map((o) => (
          <li key={o} className="organiser">
            <span className="organiser-email">{o}</span>
            {o === cloud.owner && <span className="chip">{t.cloud.owner}</span>}
            {o === cloud.email && <span className="chip">{t.cloud.you}</span>}
            {o !== cloud.owner && (
              <button
                type="button"
                className="link-button organiser-remove"
                onClick={async () => {
                  if (await confirm(t.cloud.removeConfirm(o), t.cloud.removeOrganiser)) void cloud.setOrganisers(cloud.organisers.filter((x) => x !== o));
                }}
              >
                {t.cloud.removeOrganiser}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="row organiser-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" type="email" placeholder={t.cloud.organiserEmail} aria-label={t.cloud.organiserEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="button button--quiet" disabled={!email.includes('@')}>
          {t.cloud.addOrganiser}
        </button>
      </form>
    </div>
  );
}
