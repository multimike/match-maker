// The poster for the hall (#/poster): the club's QR code big, and the three steps to check in.
// Light on paper to save ink, framed like a court from above.

import { useEffect } from 'react';
import { joinLink, useCloud } from '../cloud/context.ts';
import { QrCode } from '../components/QrCode.tsx';
import { Shuttle } from '../components/Shuttle.tsx';
import { routeHref } from '../hooks.ts';
import { useStrings } from '../strings.ts';

export function Poster() {
  const t = useStrings();
  const cloud = useCloud();
  useEffect(() => {
    document.title = `${t.poster.title}: ${t.appName}`;
  }, [t]);
  if (!cloud) return null;
  const link = joinLink(cloud.joinCode);
  return (
    <div className="poster-page">
      <div className="poster-tools">
        <a className="button button--quiet" href={routeHref('tonight')}>
          {t.poster.back}
        </a>
        <button type="button" className="button button--primary" onClick={() => window.print()}>
          {t.poster.print}
        </button>
      </div>
      <article className="poster">
        <header className="poster-head">
          <Shuttle size={84} className="poster-shuttle" />
          <h1 className="poster-title">{t.poster.title}</h1>
        </header>
        <QrCode text={link} className="poster-qr" label={t.poster.title} />
        <ol className="poster-steps">
          {t.poster.steps.map((step, i) => (
            <li key={step}>
              <span className="poster-step-number" aria-hidden="true">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="poster-link">{link}</p>
      </article>
    </div>
  );
}
