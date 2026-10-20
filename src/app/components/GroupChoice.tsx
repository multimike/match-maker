// Picking a training group: a row of buttons for a few groups, a list for more.

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
