// The shuttlecock: app mark, loading animation and the confetti when results come in.

import type { CSSProperties } from 'react';

interface ShuttleProps {
  size?: number | string;
  className?: string;
  title?: string;
}

/** A feather shuttle in flight, nose down to the left. Drawn on a 64-unit square. */
export function Shuttle({ size = 32, className, title }: ShuttleProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g transform="rotate(40 32 32)">
        {/* Skirt: feathers flaring out from the cork. */}
        <path d="M24.5 41 L10 10.5 Q32 2.5 54 10.5 L39.5 41 Z" fill="var(--shuttle-skirt, #fff)" />
        <ellipse cx="32" cy="10.4" rx="22" ry="4.2" fill="var(--shuttle-inside, #dfe8e4)" />
        <g fill="none" stroke="var(--shuttle-line, #9fb5b0)" strokeWidth="1.1" strokeLinecap="round">
          <path d="M27.2 41 L19 14.3 M30.4 41 L28 14.9 M33.6 41 L36 14.9 M36.8 41 L45 14.3" />
          <path d="M14.6 21 Q32 26 49.4 21 M19.5 31.5 Q32 35 44.5 31.5" strokeWidth="1.5" />
        </g>
        {/* Cork: a coloured band and the rounded nose. */}
        <rect x="23.5" y="39.5" width="17" height="5" rx="1.2" fill="var(--shuttle-band, #ffd43b)" />
        <path d="M23.5 44 L40.5 44 Q40.5 55.5 32 55.5 Q23.5 55.5 23.5 44 Z" fill="var(--shuttle-cork, #fff)" />
      </g>
    </svg>
  );
}

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
  const distance = 70 + (i % 3) * 28;
  return {
    '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
    '--dy': `${Math.round(Math.sin(angle) * distance - 30)}px`,
    '--spin': `${(i % 2 ? 1 : -1) * (160 + i * 23)}deg`,
    '--delay': `${(i % 4) * 30}ms`,
  } as CSSProperties;
});

/** A little burst of shuttles. Re-mount it (change its key) to play it again. */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {BURST.map((style, i) => (
        <span key={i} className="confetti-piece" style={style}>
          <Shuttle size={i % 3 === 0 ? 22 : 16} />
        </span>
      ))}
    </div>
  );
}
