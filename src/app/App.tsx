// The app shell: the organiser's screens, or the TV display at #/tv.

import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RoundCues } from './components/RoundCues.tsx';
import { ConfirmProvider } from './components/ui.tsx';
import { useRoute, useWakeLock, type Route } from './hooks.ts';
import { latestRound, openSession } from './model.ts';
import { usePrefs } from './prefs.ts';
import { Members } from './screens/Members.tsx';
import { Nav } from './screens/Nav.tsx';
import { RoundScreen } from './screens/Round.tsx';
import { Tonight } from './screens/Tonight.tsx';
import { TvScreen } from './screens/Tv.tsx';
import { audioReady, unlockAudio } from './sound.ts';
import { useAppState, useSaveError } from './store.ts';
import { STRINGS, StringsContext, useStrings } from './strings.ts';

export function App() {
  const route = useRoute();
  const { lang, sound } = usePrefs();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Browsers only allow sound after a tap, so the first tap anywhere turns it on.
  useEffect(() => {
    if (!sound) return;
    const unlock = () => {
      if (!audioReady()) unlockAudio();
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, [sound]);

  return (
    <StringsContext.Provider value={STRINGS[lang]}>
      <ConfirmProvider>{route === 'tv' ? <TvScreen /> : <Organiser route={route} />}</ConfirmProvider>
    </StringsContext.Provider>
  );
}

function Organiser({ route }: { route: Route }) {
  const t = useStrings();
  const state = useAppState();
  const session = openSession(state);
  useWakeLock(session !== undefined);
  useEffect(() => {
    document.title = t.appName;
  }, [t]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="app">
      <RoundCues round={latestRound(session)} isTv={false} />
      <Nav route={route} />
      <Banners />
      <main>{route === 'round' ? <RoundScreen /> : route === 'members' ? <Members /> : <Tonight />}</main>
    </div>
  );
}

function Banners() {
  const t = useStrings();
  const saveError = useSaveError();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <>
      {saveError !== null && (
        <div className="banner banner--error" role="alert">
          {t.saveFailed}
        </div>
      )}
      {needRefresh && (
        <div className="banner" role="status">
          {t.update}
          <button type="button" className="button button--quiet" onClick={() => updateServiceWorker(true)}>
            {t.reload}
          </button>
        </div>
      )}
    </>
  );
}
