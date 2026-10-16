// A badminton court seen from above, to scale (13.40 × 6.10 m), with each player's name tag on
// their half. The TV display shows it as is; on the organiser's screen each half is a button
// for picking the winner.

import type { CourtType } from '../../engine/engine.ts';
import type { CourtResult } from '../model.ts';
import { Avatar } from './Avatar.tsx';
import { Shuttle } from './Shuttle.tsx';

export interface Tag {
  id: string;
  name: string;
  /** Small text under the name, e.g. the rating on the organiser's screen. */
  note?: string;
}

interface CourtViewProps {
  type: CourtType;
  sides: [Tag[], Tag[]];
  result?: CourtResult;
  winLabel: string;
  /** Makes the halves buttons that pick the winner. */
  onPick?: (side: 0 | 1) => void;
  /** Both halves invite a tap (a level score needs the deciding point). */
  invite?: boolean;
  /** The half the viewer plays on (their phone). */
  mine?: 0 | 1;
}

// Court lines in centimetres: doubles and singles sidelines, long and short service lines,
// centre lines. Lines are 4 cm wide; drawn a little wider so they survive scaling down.
function CourtLines() {
  return (
    <svg className="court-lines" viewBox="0 0 1340 610" aria-hidden="true">
      <g fill="none" stroke="var(--line)" strokeWidth="7">
        <rect x="3.5" y="3.5" width="1333" height="603" />
        <path d="M0 48 H1340 M0 562 H1340 M78 0 V610 M1262 0 V610 M470 0 V610 M870 0 V610 M0 305 H470 M870 305 H1340" />
      </g>
      <line className="court-net" x1="670" y1="-8" x2="670" y2="618" />
      <line x1="670" y1="-8" x2="670" y2="618" stroke="var(--line)" strokeWidth="5" />
      <circle cx="670" cy="3" r="11" fill="var(--line)" />
      <circle cx="670" cy="607" r="11" fill="var(--line)" />
    </svg>
  );
}

function NameTag({ tag }: { tag: Tag }) {
  return (
    <span className="tag">
      <Avatar id={tag.id} name={tag.name} className="tag-avatar" />
      <span className="tag-text">
        <span className="tag-name">{tag.name}</span>
        {tag.note && <span className="tag-note">{tag.note}</span>}
      </span>
    </span>
  );
}

export function CourtView({ type, sides, result, winLabel, onPick, invite, mine }: CourtViewProps) {
  const winner = result?.winner ?? null;
  return (
    <div className={`court court--${type}`} data-winner={winner ?? 'none'} data-invite={invite || undefined}>
      <CourtLines />
      {sides.map((side, s) => {
        const content = (
          <>
            {side.map((tag) => <NameTag key={tag.id} tag={tag} />)}
            {winner === s && (
              <span className="win-badge">
                <Shuttle size="1.1em" /> {winLabel}
              </span>
            )}
            {result?.score && <span className="court-score">{result.score[s]}</span>}
          </>
        );
        const className = `court-half court-half--${s === 0 ? 'a' : 'b'}${mine === s ? ' court-half--mine' : ''}`;
        return onPick ? (
          <button
            key={s}
            type="button"
            className={className}
            aria-pressed={winner === s}
            aria-label={`${side.map((t) => t.name).join(' & ')}: ${winLabel}`}
            onClick={() => onPick(s as 0 | 1)}
          >
            {content}
          </button>
        ) : (
          <div key={s} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
