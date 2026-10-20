// Picking a training group: a row of buttons for a few groups, a list for more. And picking
// several, for the groups expected on an evening.

import { groupName } from '../format.ts';
import type { Group, TrainingGroup } from '../model.ts';
import { useStrings } from '../strings.ts';
import { Segmented } from './ui.tsx';

interface GroupChoiceProps {
  label: string;
  groups: TrainingGroup[];
  /** 0 when nothing is chosen yet (signing up on a phone). */
  value: Group | 0;
  onChange: (group: Group) => void;
  id?: string;
}

export function GroupChoice({ label, groups, value, onChange, id }: GroupChoiceProps) {
  const t = useStrings();
  if (groups.length <= 3) {
    return <Segmented<Group | 0> label={label} value={value} onChange={(g) => g !== 0 && onChange(g)} options={groups.map((g) => ({ value: g.id, label: groupName(t, g) }))} />;
  }
  return (
    <select id={id} className="input" aria-label={id ? undefined : label} value={value || ''} required onChange={(e) => onChange(Number(e.target.value))}>
      {value === 0 && (
        <option value="" disabled>
          {t.groups.pick}
        </option>
      )}
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {groupName(t, g)}
        </option>
      ))}
    </select>
  );
}

interface GroupsChoiceProps {
  label: string;
  groups: TrainingGroup[];
  /** The chosen groups; undefined means all of them. */
  value: Group[] | undefined;
  onChange: (groups: Group[] | undefined) => void;
}

/** Picking several training groups, at least one: buttons that stay pressed. */
export function GroupsChoice({ label, groups, value, onChange }: GroupsChoiceProps) {
  const t = useStrings();
  const chosen = new Set(value ?? groups.map((g) => g.id));
  const toggle = (id: Group) => {
    const next = groups.map((g) => g.id).filter((g) => (g === id ? !chosen.has(g) : chosen.has(g)));
    if (next.length === 0) return;
    onChange(next.length === groups.length ? undefined : next);
  };
  return (
    <div className="segmented segmented--multi" role="group" aria-label={label}>
      {groups.map((g) => (
        <button key={g.id} type="button" className="segment" aria-pressed={chosen.has(g.id)} onClick={() => toggle(g.id)}>
          {groupName(t, g)}
        </button>
      ))}
    </div>
  );
}
