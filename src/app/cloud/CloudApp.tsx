// The app with the cloud set up. Phones get the player view (#/play, #/join/<code>). Organisers
// sign in with Google; the first one sets the club up. Then the organiser's screens run on the
// club's data in Firestore (store.ts), exactly as they would on one device.

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type Auth, type User } from 'firebase/auth';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { App } from '../App.tsx';
import { Shuttle } from '../components/Shuttle.tsx';
import { Dialog } from '../components/ui.tsx';
import { TV_WINDOW, go, joinCodeOf, tvCodeOf, useRoute } from '../hooks.ts';
import { PlayScreen } from '../screens/Play.tsx';
import { TvLink } from '../screens/TvLink.tsx';
import { localStorageBackend } from '../storage.ts';
import { StoreContext, useAppState, useDispatch } from '../store.ts';
import { useStrings } from '../strings.ts';
import { createClub, replaceJoinCode, setOrganisers, watchSettings, type ClubSettings, type SettingsState } from './club.ts';
import { useEmulators } from './config.ts';
import { CloudContext, ROLE_KEY, type CloudInfo } from './context.ts';
import { getCloud, type Cloud } from './firebase.ts';
import { createCloudStore, type CloudStore } from './store.ts';

export function CloudApp() {
  const route = useRoute();
  const cloud = getCloud();

  // A phone or TV that has joined goes back to its view, also from a home-screen icon.
  useEffect(() => {
    if (location.hash) return;
    const role = localStorage.getItem(ROLE_KEY);
    if (role === 'player') go('play');
    if (role === 'tv') go('tv');
  }, []);

  if (route === 'play' || route === 'join') return <PlayScreen key={playKey()} cloud={cloud} />;
  if (route === 'tv' && (tvCodeOf(location.hash) || localStorage.getItem(ROLE_KEY) === 'tv')) {
    return <TvLink key={tvKey()} cloud={cloud} />;
  }
  return <OrganiserGate cloud={cloud} />;
}

// A join link opened while the player view is already showing (only the part after # changes,
// so the page doesn't reload) starts the player view again with the new code. The address
// goes back to #/play after joining, which mustn't start it again.
let lastJoinCode = '';
function playKey(): string {
  lastJoinCode = joinCodeOf(location.hash) ?? lastJoinCode;
  return lastJoinCode;
}

let lastTvCode = '';
function tvKey(): string {
  lastTvCode = tvCodeOf(location.hash) ?? lastTvCode;
  return lastTvCode;
}

function useUser(auth: Auth): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);
  return user;
}

function OrganiserGate({ cloud }: { cloud: Cloud }) {
  const user = useUser(cloud.auth);
  if (user === undefined) return <Loading />;
  // Phones sign in anonymously; an organiser needs a Google account.
  if (!user || user.isAnonymous || !user.email) return <SignIn cloud={cloud} />;
  return <OrganiserSession key={user.uid} cloud={cloud} email={user.email} />;
}

function OrganiserSession({ cloud, email }: { cloud: Cloud; email: string }) {
  const t = useStrings();
  const [settings, setSettings] = useState<SettingsState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => watchSettings(cloud.db, setSettings), [cloud.db]);
  useEffect(() => localStorage.setItem(ROLE_KEY, 'organiser'), []);
  const leave = () => void signOut(cloud.auth);

  if (settings === 'loading') return <Loading />;
  if (settings === 'denied') {
    return (
      <Gate title={t.cloud.notOrganiserTitle} lead={t.cloud.notOrganiserLead(email)}>
        <button type="button" className="button button--primary button--big" onClick={leave}>
          {t.cloud.otherAccount}
        </button>
      </Gate>
    );
  }
  if (settings === null) {
    return (
      <Gate title={t.cloud.setUpTitle} lead={t.cloud.setUpLead(email.toLowerCase())}>
        <button
          type="button"
          className="button button--primary button--big"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            createClub(cloud.db, email).catch(() => setBusy(false));
          }}
        >
          {t.cloud.setUp}
        </button>
        <button type="button" className="link-button gate-link" onClick={leave}>
          {t.cloud.otherAccount}
        </button>
      </Gate>
    );
  }
  return <OrganiserApp cloud={cloud} settings={settings} email={email} />;
}

function OrganiserApp({ cloud, settings, email }: { cloud: Cloud; settings: ClubSettings; email: string }) {
  const [store, setStore] = useState<CloudStore | null>(null);
  useEffect(() => {
    // A TV view only shows; the organiser's main window handles phones' requests.
    const tv = window.name === TV_WINDOW || location.hash.startsWith('#/tv');
    const created = createCloudStore(cloud.db, { handleRequests: !tv });
    let current = true;
    void created.ready.then(() => current && setStore(created));
    return () => {
      current = false;
      created.stop();
      setStore(null);
    };
  }, [cloud.db]);

  const info = useMemo<CloudInfo>(() => ({
    email: email.toLowerCase(),
    owner: settings.owner,
    organisers: settings.organisers,
    joinCode: settings.joinCode,
    setOrganisers: (emails) => setOrganisers(cloud.db, emails),
    replaceJoinCode: () => replaceJoinCode(cloud.db),
    signOut: () => signOut(cloud.auth),
  }), [cloud, settings, email]);

  if (!store) return <Loading />;
  return (
    <CloudContext.Provider value={info}>
      <StoreContext.Provider value={store}>
        <App />
        <MoveLocalData />
      </StoreContext.Provider>
    </CloudContext.Provider>
  );
}

/**
 * Data from before the cloud, still in this browser: offered once, when the club's cloud data
 * is empty.
 */
function MoveLocalData() {
  const t = useStrings();
  const state = useAppState();
  const dispatch = useDispatch();
  const [local] = useState(() => {
    const saved = localStorageBackend().load();
    return saved.members.length > 0 || saved.sessions.length > 0 ? saved : null;
  });
  const [asked, setAsked] = useState(() => localStorage.getItem(MOVED_KEY) !== null);
  const empty = state.members.length === 0 && state.sessions.length === 0;
  if (!local || asked || !empty) return null;
  const done = () => {
    localStorage.setItem(MOVED_KEY, new Date().toISOString());
    setAsked(true);
  };
  return (
    <Dialog
      open
      onClose={done}
      title={t.cloud.moveTitle}
      variant="alert"
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={done}>
            {t.cloud.moveSkip}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              dispatch({ type: 'state/replace', state: local });
              done();
            }}
          >
            {t.cloud.moveCopy}
          </button>
        </>
      }
    >
      <p className="confirm-message">{t.cloud.moveLead(local.members.length, local.sessions.length)}</p>
    </Dialog>
  );
}

const MOVED_KEY = 'matchmaker.movedToCloud';

// A popup on the real site: a full-page redirect doesn't work on browsers that block third-party
// storage when the site isn't hosted on Firebase. The local emulators work with a redirect too,
// which also suits browsers that open popups in the same tab.
const signInWithGoogle = useEmulators ? signInWithRedirect : signInWithPopup;

function SignIn({ cloud }: { cloud: Cloud }) {
  const t = useStrings();
  const [failed, setFailed] = useState(false);
  const signIn = async () => {
    setFailed(false);
    try {
      await signInWithGoogle(cloud.auth, new GoogleAuthProvider());
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setFailed(true);
    }
  };
  return (
    <Gate title={t.cloud.signInTitle} lead={t.cloud.signInLead}>
      <button type="button" className="button button--primary button--big" onClick={signIn}>
        <GoogleMark /> {t.cloud.signIn}
      </button>
      {failed && (
        <p className="gate-error" role="alert">
          {t.cloud.signInFailed}
        </p>
      )}
      <p className="gate-aside">{t.cloud.hereToPlay}</p>
    </Gate>
  );
}

/** A full-screen card on the hall background, for signing in and setting up. */
function Gate({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const t = useStrings();
  useEffect(() => {
    document.title = t.appName;
  }, [t]);
  return (
    <div className="gate">
      <div className="gate-card">
        <Shuttle size={64} className="gate-mark" />
        <h1 className="gate-title">{title}</h1>
        <p className="gate-lead">{lead}</p>
        <div className="gate-actions">{children}</div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="gate" aria-busy="true">
      <Shuttle size={72} className="bob" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
