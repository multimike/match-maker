// Adding and editing a member: name, usual group, singles/doubles preference, competition
// partner, and (for existing members) a rating nudge.

import { useState } from 'react';
import type { Pref } from '../../engine/engine.ts';
import { RATING, isProvisional } from '../../engine/rating.ts';
import { PrefIcon } from '../components/PrefIcon.tsx';
import { Dialog, Segmented, useConfirm } from '../components/ui.tsx';
import { PARTNER_SHARES, type Group, type Member } from '../model.ts';
import type { MemberInput } from '../state.ts';
import { newId, useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';

interface MemberFormProps {
  /** The member to edit, or undefined to add one. */
  member?: Member;
  /** Prefilled name when adding. */
  name?: string;
  onClose: () => void;
  /** Called with the new member's id after adding. */
  onAdded?: (id: string) => void;
}

const PREFS: Pref[] = ['singles', 'either', 'doubles'];

export function MemberForm({ member, name: initialName = '', onClose, onAdded }: MemberFormProps) {
  const t = useStrings();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const { members } = useAppState();
  const [name, setName] = useState(member?.name ?? initialName);
  const [group, setGroup] = useState<Group>(member?.group ?? 1);
  const [pref, setPref] = useState<Pref>(member?.pref ?? 'either');
  const [partnerId, setPartnerId] = useState<string | null>(member?.partnerId ?? null);
  const [share, setShare] = useState(member?.partnerShare ?? 0.5);
  const [rating, setRating] = useState(member ? Math.round(member.rating) : 0);

  const others = members.filter((m) => m.id !== member?.id).sort((a, b) => a.name.localeCompare(b.name, t.locale));
  const input: MemberInput = { name, group, pref, partnerId, partnerShare: share };
  const nudged = member && rating !== Math.round(member.rating) ? rating : undefined;

  const submit = () => {
    if (!name.trim()) return;
    if (member) {
      dispatch({ type: 'member/update', id: member.id, member: input, rating: nudged });
    } else {
      const id = newId();
      dispatch({ type: 'member/add', member: input, id });
      onAdded?.(id);
    }
    onClose();
  };

  const remove = async () => {
    if (member && (await confirm(t.form.deleteConfirm(member.name), t.form.delete))) {
      dispatch({ type: 'member/delete', id: member.id });
      onClose();
    }
  };

  return (
    <Dialog open onClose={onClose} title={member ? t.form.editTitle : t.form.addTitle} className="dialog--form">
      {member?.status === 'new' && (
        <div className="notice notice--form">
          <span>{t.form.newNotice}</span>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              dispatch({ type: 'member/confirm', id: member.id });
              onClose();
            }}
          >
            {t.form.confirm}
          </button>
        </div>
      )}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">{t.form.name}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={40} autoComplete="off" />
          <span className="field-hint">{t.form.nameHint}</span>
        </label>

        <div className="field">
          <span className="field-label">{t.form.group}</span>
          <Segmented
            label={t.form.group}
            value={group}
            onChange={setGroup}
            options={[1, 2].map((g) => ({ value: g as Group, label: t.members.groupN(g) }))}
          />
          <span className="field-hint">{t.form.groupHint(RATING.start[1], RATING.start[2])}</span>
        </div>

        <div className="field">
          <span className="field-label">{t.form.prefers}</span>
          <Segmented
            label={t.form.prefers}
            value={pref}
            onChange={setPref}
            options={PREFS.map((p) => ({
              value: p,
              label: (
                <>
                  <PrefIcon pref={p} /> {t.pref[p]}
                </>
              ),
            }))}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="partner">{t.form.partner}</label>
          <select id="partner" className="input" value={partnerId ?? ''} onChange={(e) => setPartnerId(e.target.value || null)}>
            <option value="">{t.form.noPartner}</option>
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {partnerId && (
            <Segmented
              className="segmented--small"
              label={t.form.howOften}
              value={share}
              onChange={setShare}
              options={PARTNER_SHARES.map((s, i) => ({ value: s, label: t.form.shares[i] }))}
            />
          )}
        </div>

        {member && (
          <div className="field">
            <label className="field-label" htmlFor="rating">
              {t.form.rating}
              {isProvisional(member) && <span className="prov-tag">{t.members.provisional}</span>}
            </label>
            <div className="rating-nudge">
              <button type="button" className="button button--quiet" onClick={() => setRating((r) => r - 25)}>
                −25
              </button>
              <input
                id="rating"
                className="input input--number"
                type="number"
                inputMode="numeric"
                step={1}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              />
              <button type="button" className="button button--quiet" onClick={() => setRating((r) => r + 25)}>
                +25
              </button>
            </div>
            <span className="field-hint">{t.form.ratingHint}</span>
          </div>
        )}

        <div className="dialog-actions">
          {member && (
            <button type="button" className="button button--danger-quiet dialog-actions-start" onClick={remove}>
              {t.form.delete}
            </button>
          )}
          <button type="button" className="button button--quiet" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={!name.trim()}>
            {member ? t.save : t.form.add}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
