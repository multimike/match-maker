// The Firebase project behind phones and shared data. A web app's Firebase config is public by
// design: what protects the data is the security rules in firestore.rules. Until it is filled
// in, the app runs on one device with the data in the browser, as before.

import type { FirebaseOptions } from 'firebase/app';

export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyB3Sopq65E6YNZrjz0tvF3HE2JUen7TYm0',
  authDomain: 'matchmaker-f9f89.firebaseapp.com',
  projectId: 'matchmaker-f9f89',
  storageBucket: 'matchmaker-f9f89.firebasestorage.app',
  messagingSenderId: '140280357474',
  appId: '1:140280357474:web:413816ddc95130f8c7a73b',
};

/** `npm run dev:cloud` uses the local emulators (`npm run emulators`) instead. */
export const useEmulators = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

export const cloudConfigured = useEmulators || firebaseConfig !== null;
