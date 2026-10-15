// Coloured initial avatars. The colour comes from the member's id, so it never changes.

// Bright racket-frame colours, all light enough for dark initials. Yellow and court green are
// left out: they mean "winner" and "court" in this app.
const COLOURS = ['#ff8a7a', '#7cb7ff', '#c7a6ff', '#ff9ccf', '#7fe0c9', '#ffb15c', '#b5e36b', '#8fd3ff', '#f7a8a8', '#d5b8ff'];

export function avatarColour(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? '' : '';
  return (first + last).toUpperCase();
}

interface AvatarProps {
  id: string;
  name: string;
  className?: string;
}

export function Avatar({ id, name, className }: AvatarProps) {
  return (
    <span className={`avatar ${className ?? ''}`} style={{ background: avatarColour(id) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
