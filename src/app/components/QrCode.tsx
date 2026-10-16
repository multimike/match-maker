// A QR code as SVG: dark squares on white with the standard quiet zone, so phone cameras read
// it from across the hall. Medium error correction survives a crease or a bit of tape.

import { useMemo } from 'react';
import { encode } from 'uqr';

export function QrCode({ text, className, label }: { text: string; className?: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 4 });
    let d = '';
    qr.data.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }));
    return { size: qr.size, path: d };
  }, [text]);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#0e2a2e" />
    </svg>
  );
}
