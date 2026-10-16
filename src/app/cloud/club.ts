// The club's settings document: who the organisers are, and the code that lets phones join.
// Only organisers can read it (the security rules), so the code stays off players' phones
// except through the QR poster.

import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc, writeBatch, type Firestore, type Unsubscribe } from 'firebase/firestore';

export const SETTINGS = 'club/settings';
export const PLAYERS = 'players';

export interface ClubSettings {
  owner: string;
  organisers: string[];
  joinCode: string;
}

/** The settings, null if the club hasn't been set up, or 'denied' if this account isn't an organiser. */
export type SettingsState = ClubSettings | null | 'denied';

export function watchSettings(db: Firestore, onChange: (settings: SettingsState) => void): Unsubscribe {
  return onSnapshot(
    doc(db, SETTINGS),
    { includeMetadataChanges: true },
    (snap) => {
      // Settings this device just wrote count once the server has them: until then the rules,
      // which read them on the server, would refuse everything else.
      if (snap.metadata.hasPendingWrites) return;
      onChange(snap.exists() ? (snap.data() as ClubSettings) : null);
    },
    () => onChange('denied'),
  );
}

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A join code: 12 characters, about 60 bits, easy to read off a poster if it comes to that. */
export function newJoinCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** The first organiser sets the club up and becomes its owner. */
export function createClub(db: Firestore, email: string): Promise<void> {
  const me = email.toLowerCase();
  return setDoc(doc(db, SETTINGS), { owner: me, organisers: [me], joinCode: newJoinCode() });
}

export function setOrganisers(db: Firestore, organisers: string[]): Promise<void> {
  return updateDoc(doc(db, SETTINGS), { organisers: [...new Set(organisers.map((e) => e.trim().toLowerCase()))] });
}

/**
 * A new code, for when the poster's code has spread further than the club. Phones that joined
 * are signed out too: everyone scans the new poster.
 */
export async function replaceJoinCode(db: Firestore): Promise<void> {
  await updateDoc(doc(db, SETTINGS), { joinCode: newJoinCode() });
  const phones = await getDocs(collection(db, PLAYERS));
  for (let i = 0; i < phones.docs.length; i += 400) {
    const batch = writeBatch(db);
    phones.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
