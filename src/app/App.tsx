// The app shell and the organiser's routes. Shell provides the language, sound and confirm
// dialogs; App picks the screen: the organiser's screens, the TV display at #/tv, or the poster
// at #/poster. Phones (#/play) are handled by cloud/CloudApp.tsx when the cloud is set up.

import { useEffect, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RoundCues } from './components/RoundCues.tsx';
import { Shuttle } from './components/Shuttle.tsx';
import { ConfirmProvider } from './components/ui.tsx';
import { useCloud } from './cloud/context.ts';
import { useOnline, useRoute, useWakeLock, type Route } from './hooks.ts';
import { latestRound, localDate, openSession } from './model.ts';
import { usePrefs } from './prefs.ts';
import { Members } from './screens/Members.tsx';
import { Nav } from './screens/Nav.tsx';
import { Poster } from './screens/Poster.tsx';
import { RoundScreen } from './screens/Round.tsx';
import { Tonight } from './screens/Tonight.tsx';
import { OrganiserTv } from './screens/Tv.tsx';
import { audioReady, unlockAudio } from './sound.ts';
import { useAppState, useDispatch, useSaveError } from './store.ts';
import { STRINGS, StringsContext, useStrings } from './strings.ts';

export function Shell({ children }: { children: ReactNode }) {
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
      <ConfirmProvider>{children}</ConfirmProvider>
    </StringsContext.Provider>
  );
}

export function App() {
  const route = useRoute();
  const cloud = useCloud();
  if (route === 'tv') return <OrganiserTv />;
  if (route === 'play' || route === 'join') return <NoCloud />;
  if (route === 'poster' && cloud) return <Poster />;
  return <Organiser route={route} />;
}

function Organiser({ route }: { route: Route }) {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const session = openSession(state);
  useWakeLock(session !== undefined);
  // A friendly evening someone forgot to end closes the next day, so it can't hold up a club night.
  const forgotten = session?.friendly && session.date !== localDate(Date.now());
  useEffect(() => {
    if (forgotten) dispatch({ type: 'session/close' });
  }, [forgotten, dispatch]);
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
  const cloud = useCloud();
  const online = useOnline();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <>
      {saveError !== null && (
        <div className="banner banner--error" role="alert">
          {cloud ? t.cloud.saveFailed : t.saveFailed}
        </div>
      )}
      {cloud && !online && (
        <div className="banner" role="status">
          {t.cloud.offline}
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

/** A phone that opened the player view while the app runs on one device. */
function NoCloud() {
  const t = useStrings();
  return (
    <div className="gate">
      <div className="gate-card">
        <Shuttle size={64} className="gate-mark" />
        <h1 className="gate-title">{t.cloud.noCloudTitle}</h1>
        <p className="gate-lead">{t.cloud.noCloudLead}</p>
      </div>
    </div>
  );
}
