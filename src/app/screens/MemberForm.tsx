// Adding and editing a member: name, usual group, singles/doubles preference, competition
// partner, and (for existing members) a rating nudge.

import { useId, useState } from 'react';
import type { Pref } from '../../engine/engine.ts';
import { RATING, isProvisional } from '../../engine/rating.ts';
import { PrefIcon } from '../components/PrefIcon.tsx';
import { Dialog, Field, Section, Segmented, SettingRow, useConfirm } from '../components/ui.tsx';
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
  const formId = useId();

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
    if (member && (await confirm({ ...t.form.deleteConfirm(member.name), ok: t.form.delete }))) {
      dispatch({ type: 'member/delete', id: member.id });
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={member ? t.form.editTitle : t.form.addTitle}
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" form={formId} className="button button--primary" disabled={!name.trim()}>
            {member ? t.save : t.form.add}
          </button>
        </>
      }
    >
      {member?.status === 'new' && (
        <div className="notice">
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
        id={formId}
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t.form.name} hint={t.form.nameHint} htmlFor={`${formId}-name`}>
          <input id={`${formId}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus={member ? undefined : true} required maxLength={40} autoComplete="off" />
        </Field>

        <Field label={t.form.group} hint={t.form.groupHint(RATING.start[1], RATING.start[2])}>
          <Segmented
            label={t.form.group}
            value={group}
            onChange={setGroup}
            options={[1, 2].map((g) => ({ value: g as Group, label: t.members.groupN(g) }))}
          />
        </Field>

        <Field label={t.form.prefers}>
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
        </Field>

        <Field label={t.form.partner} htmlFor={`${formId}-partner`}>
          <select id={`${formId}-partner`} className="input" value={partnerId ?? ''} onChange={(e) => setPartnerId(e.target.value || null)}>
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
        </Field>

        {member && (
          <Field
            label={
              <>
                {t.form.rating}
                {isProvisional(member) && <span className="prov-tag">{t.members.provisional}</span>}
              </>
            }
            hint={t.form.ratingHint}
            htmlFor={`${formId}-rating`}
          >
            <div className="rating-nudge">
              <button type="button" className="button button--quiet" onClick={() => setRating((r) => r - 25)}>
                −25
              </button>
              <input
                id={`${formId}-rating`}
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
          </Field>
        )}
      </form>

      {member && (
        <Section title={t.settings.danger} danger>
          <SettingRow label={t.form.delete} hint={t.form.deleteHint}>
            <button type="button" className="button button--danger-quiet" onClick={remove}>
              {t.settings.deleteButton}
            </button>
          </SettingRow>
        </Section>
      )}
    </Dialog>
  );
}
