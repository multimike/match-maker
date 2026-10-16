// Firebase for the app: Auth (Google for organisers, anonymous for phones) and Firestore with an
// offline cache that the device's windows share, so a dropped Wi-Fi in the hall doesn't stop
// the evening. Only loaded when the cloud is set up (config.ts).

import { initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { firebaseConfig, useEmulators } from './config.ts';

export interface Cloud {
  auth: Auth;
  db: Firestore;
}

const EMULATOR_PROJECT = { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-matchmaker', appId: 'demo-app' };

let cloud: Cloud | null = null;

export function getCloud(): Cloud {
  if (cloud) return cloud;
  const config = useEmulators ? EMULATOR_PROJECT : firebaseConfig;
  if (!config) throw new Error('Firebase is not set up (src/app/cloud/config.ts)');
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (useEmulators) {
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8088);
  }
  cloud = { auth, db };
  return cloud;
}
