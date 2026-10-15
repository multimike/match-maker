// Device settings and the data's safety net: language, sound, backup and restore.

import { useRef, useState } from 'react';
import { Dialog, Segmented, useConfirm } from '../components/ui.tsx';
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
        <span className="field-hint">{t.settings.backupHint}</span>
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
            if (await confirm(t.settings.wipeConfirm, t.settings.wipe)) {
              dispatch({ type: 'state/replace', state: emptyState() });
              onClose();
            }
          }}
        >
          {t.settings.wipe}
        </button>
        <button type="button" className="button button--primary" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </Dialog>
  );
}
