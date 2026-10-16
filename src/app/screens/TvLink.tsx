// The TV display on a device of its own at the TV (#/tv/<code>): it joins the club with the code,
// like a phone, and shows tonight's live view. No sign-in, and it never changes anything.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ROLE_KEY } from '../cloud/context.ts';
import type { Cloud } from '../cloud/firebase.ts';
import { createPlayerClient, type PlayerClient } from '../cloud/player.ts';
import { Shuttle } from '../components/Shuttle.tsx';
import { tvCodeOf } from '../hooks.ts';
import { useStrings } from '../strings.ts';
import { TvScreen } from './Tv.tsx';

export function TvLink({ cloud }: { cloud: Cloud }) {
  // Read once: the code leaves the address bar after joining.
  const [code] = useState(() => tvCodeOf(location.hash));
  const [client, setClient] = useState<PlayerClient | null>(null);

  useEffect(() => {
    const created = createPlayerClient(cloud, code);
    setClient(created);
    if (code) history.replaceState(null, '', '#/tv');
    if (localStorage.getItem(ROLE_KEY) !== 'organiser') localStorage.setItem(ROLE_KEY, 'tv');
    return () => created.stop();
  }, [cloud, code]);

  return client ? <Connected client={client} /> : <Waiting />;
}

function Connected({ client }: { client: PlayerClient }) {
  const t = useStrings();
  const state = useSyncExternalStore(client.subscribe, client.getState);
  if (state.phase === 'scan' || state.phase === 'error') {
    return (
      <div className="gate">
        <div className="gate-card">
          <Shuttle size={72} className="gate-mark" />
          <h1 className="gate-title">{state.phase === 'error' ? t.phone.errorTitle : t.tv.notConnected}</h1>
          <p className="gate-lead">{state.phase === 'error' ? t.phone.errorLead : state.badCode ? t.tv.replaced : t.tv.notConnectedLead}</p>
        </div>
      </div>
    );
  }
  if (state.phase === 'starting' || !state.loaded) return <Waiting />;
  return <TvScreen session={state.live.session} members={state.members} standalone />;
}

function Waiting() {
  return (
    <div className="gate" aria-busy="true">
      <Shuttle size={72} className="bob" />
    </div>
  );
}
