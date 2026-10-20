// Tests for firestore.rules against the Firestore emulator. `npm run test:rules` starts the
// emulator, runs these and stops it again. They aren't part of `npm test`, which needs no
// emulator (and no Java).

import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

const CODE = 'join-code-123';
let env: RulesTestEnvironment;

const db = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;
const google = (uid: string, email: string) =>
  env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
// The owner's token has capitals: organisers are listed in lower case.
const owner = () => google('owner', 'Owner@Club.se');
const helper = () => google('helper', 'helper@club.se');
const stranger = () => google('stranger', 'someone@else.se');
const phone = (uid = 'phone1') => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });
const nobody = () => env.unauthenticatedContext();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-matchmaker-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8088 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

// A club run by owner@club.se and helper@club.se, and one phone that has joined and says it's Anna.
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = db(ctx);
    await setDoc(doc(d, 'club/settings'), { owner: 'owner@club.se', organisers: ['owner@club.se', 'helper@club.se'], joinCode: CODE });
    await setDoc(doc(d, 'club/members'), { json: '[]' });
    await setDoc(doc(d, 'club/groups'), { json: '[]' });
    await setDoc(doc(d, 'club/history'), { json: '{"met":{}}' });
    await setDoc(doc(d, 'live/current'), { json: '{"session":null}' });
    await setDoc(doc(d, 'sessions/s1'), { json: '{}', state: 'open', date: '2026-10-16' });
    await setDoc(doc(d, 'players/phone1'), { code: CODE, joinedAt: Timestamp.now(), memberId: 'anna1' });
    await setDoc(doc(d, 'requests/r1'), { uid: 'phone1', at: Timestamp.now(), type: 'checkOut', memberId: 'anna1' });
  });
}

describe('setting up the club', () => {
  const settings = { owner: 'owner@club.se', organisers: ['owner@club.se'], joinCode: CODE };

  test('the first Google account to set it up becomes the owner', async () => {
    await assertSucceeds(getDoc(doc(db(owner()), 'club/settings'))); // looking up a club that doesn't exist yet
    await assertSucceeds(setDoc(doc(db(owner()), 'club/settings'), settings));
  });

  test('not anonymously, not as someone else, and not with a short code', async () => {
    await assertFails(setDoc(doc(db(phone()), 'club/settings'), settings));
    await assertFails(setDoc(doc(db(stranger()), 'club/settings'), settings));
    await assertFails(setDoc(doc(db(owner()), 'club/settings'), { ...settings, joinCode: 'short' }));
    await assertFails(setDoc(doc(db(owner()), 'club/settings'), { ...settings, organisers: ['owner@club.se', 'friend@club.se'] }));
  });

  test('once set up, nobody else can take it over', async () => {
    await seed();
    await assertFails(setDoc(doc(db(stranger()), 'club/settings'), { owner: 'someone@else.se', organisers: ['someone@else.se'], joinCode: CODE }));
  });
});

describe('organisers', () => {
  beforeEach(seed);

  test('read the settings; nobody else does', async () => {
    await assertSucceeds(getDoc(doc(db(owner()), 'club/settings')));
    await assertSucceeds(getDoc(doc(db(helper()), 'club/settings')));
    await assertFails(getDoc(doc(db(stranger()), 'club/settings')));
    await assertFails(getDoc(doc(db(phone()), 'club/settings')));
  });

  test('add organisers and change the code, but the owner stays', async () => {
    const d = db(helper());
    await assertSucceeds(updateDoc(doc(d, 'club/settings'), { organisers: ['owner@club.se', 'helper@club.se', 'new@club.se'], joinCode: 'another-code-456' }));
    await assertFails(updateDoc(doc(d, 'club/settings'), { owner: 'helper@club.se' }));
    await assertFails(updateDoc(doc(d, 'club/settings'), { organisers: ['helper@club.se'] }));
  });

  test('read and write all of the club data', async () => {
    const d = db(owner());
    for (const path of ['club/members', 'club/groups', 'club/history', 'live/current', 'sessions/s1', 'sessions/s2']) {
      await assertSucceeds(setDoc(doc(d, path), { json: '{}' }));
      await assertSucceeds(getDoc(doc(d, path)));
    }
    await assertSucceeds(getDocs(collection(d, 'sessions')));
    await assertSucceeds(getDocs(collection(d, 'players')));
    await assertSucceeds(deleteDoc(doc(d, 'players/phone1')));
  });

  test('handle the requests from phones', async () => {
    const d = db(owner());
    await assertSucceeds(getDocs(query(collection(d, 'requests'), orderBy('at'))));
    await assertSucceeds(deleteDoc(doc(d, 'requests/r1')));
  });

  test('a Google account that isn’t listed gets nothing', async () => {
    const d = db(stranger());
    for (const path of ['club/members', 'club/groups', 'club/history', 'live/current', 'sessions/s1']) {
      await assertFails(getDoc(doc(d, path)));
      await assertFails(setDoc(doc(d, path), { json: '{}' }));
    }
  });
});

describe('phones', () => {
  beforeEach(seed);

  test('join with the club’s current code, and only that', async () => {
    const join = (uid: string, data: object) => setDoc(doc(db(phone(uid)), `players/${uid}`), data);
    await assertFails(join('p2', { code: 'wrong-code-000', joinedAt: serverTimestamp() }));
    await assertFails(join('p2', { code: CODE, joinedAt: Timestamp.now() })); // the server sets the time
    await assertFails(join('p2', { code: CODE, joinedAt: serverTimestamp(), memberId: 'anna1' }));
    await assertFails(setDoc(doc(db(phone('p2')), 'players/p3'), { code: CODE, joinedAt: serverTimestamp() }));
    await assertSucceeds(join('p2', { code: CODE, joinedAt: serverTimestamp() }));
  });

  test('a joined phone reads the members, the groups and tonight, nothing else', async () => {
    const d = db(phone());
    await assertSucceeds(getDoc(doc(d, 'club/members')));
    await assertSucceeds(getDoc(doc(d, 'club/groups')));
    await assertFails(setDoc(doc(d, 'club/groups'), { json: '[]' }));
    await assertSucceeds(getDoc(doc(d, 'live/current')));
    await assertSucceeds(getDoc(doc(d, 'players/phone1')));
    for (const path of ['club/history', 'club/settings', 'sessions/s1', 'requests/r1']) await assertFails(getDoc(doc(d, path)));
    await assertFails(getDocs(collection(d, 'players')));
    await assertFails(setDoc(doc(d, 'club/members'), { json: '[]' }));
    await assertFails(setDoc(doc(d, 'live/current'), { json: '{}' }));
  });

  test('without joining, or without signing in, nothing', async () => {
    for (const d of [db(phone('p9')), db(nobody())]) {
      await assertFails(getDoc(doc(d, 'club/members')));
      await assertFails(getDoc(doc(d, 'live/current')));
    }
  });

  test('a phone says who it is, but can’t change its code', async () => {
    const d = db(phone());
    await assertSucceeds(updateDoc(doc(d, 'players/phone1'), { memberId: 'bo22' }));
    await assertSucceeds(updateDoc(doc(d, 'players/phone1'), { memberId: deleteField() }));
    await assertFails(updateDoc(doc(d, 'players/phone1'), { memberId: '../settings' }));
    await assertFails(updateDoc(doc(d, 'players/phone1'), { code: 'another-code-456' }));
    await assertFails(updateDoc(doc(db(phone('p2')), 'players/phone1'), { memberId: 'bo22' }));
  });
});

describe('requests from phones', () => {
  beforeEach(seed);

  const send = (data: object, uid = 'phone1') => addDoc(collection(db(phone(uid)), 'requests'), { uid, at: serverTimestamp(), memberId: 'anna1', ...data });

  test('check-in, changes and check-out for the phone’s own member', async () => {
    await assertSucceeds(send({ type: 'checkIn', energy: 'easy', restOk: true }));
    await assertSucceeds(send({ type: 'update', skip: true }));
    await assertSucceeds(send({ type: 'update', energy: 'challenge', restOk: false }));
    await assertSucceeds(send({ type: 'checkOut' }));
  });

  test('sign-up and profile need consent and sensible values', async () => {
    await assertSucceeds(send({ type: 'signup', name: 'Anna', group: 2, pref: 'doubles', consent: true }));
    await assertFails(send({ type: 'signup', name: 'Anna', group: 2, pref: 'doubles' }));
    await assertFails(send({ type: 'signup', name: 'A'.repeat(41), group: 2, pref: 'doubles', consent: true }));
    await assertSucceeds(send({ type: 'signup', name: 'Anna', group: 3, pref: 'doubles', consent: true }));
    await assertFails(send({ type: 'signup', name: 'Anna', group: 0, pref: 'doubles', consent: true }));
    await assertFails(send({ type: 'signup', name: 'Anna', group: '1', pref: 'doubles', consent: true }));
    await assertSucceeds(send({ type: 'profile', pref: 'singles', consent: true }));
    await assertFails(send({ type: 'profile', consent: false }));
  });

  test('results: winner or null, and an optional score of two numbers', async () => {
    const result = { type: 'result', roundId: 'round1', court: 2, winner: 1 };
    await assertSucceeds(send(result));
    await assertSucceeds(send({ ...result, winner: null }));
    await assertSucceeds(send({ ...result, score: [14, 15] }));
    await assertFails(send({ ...result, score: [14, 15, 16] }));
    await assertFails(send({ ...result, court: '2' }));
    await assertFails(send({ ...result, winner: 2 }));
  });

  test('refused: someone else’s member or uid, extra fields, bad values, client time', async () => {
    await assertFails(send({ type: 'checkIn', energy: 'easy', restOk: true, memberId: 'bo22' }));
    await assertFails(addDoc(collection(db(phone()), 'requests'), { uid: 'phone2', at: serverTimestamp(), memberId: 'anna1', type: 'checkOut' }));
    await assertFails(send({ type: 'checkOut', rating: 2000 }));
    await assertFails(send({ type: 'checkIn', energy: 'sleepy', restOk: true }));
    await assertFails(send({ type: 'checkIn', energy: 'easy' }));
    await assertFails(send({ type: 'rating', rating: 2000 }));
    await assertFails(send({ type: 'checkOut', at: Timestamp.now() }));
  });

  test('refused from a phone that hasn’t joined, and phones can’t read them', async () => {
    await assertFails(send({ type: 'checkOut' }, 'p9'));
    await assertFails(getDocs(collection(db(phone()), 'requests')));
  });
});
