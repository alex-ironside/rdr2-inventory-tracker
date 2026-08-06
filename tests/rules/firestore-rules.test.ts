// Security rules coverage for firestore.rules — the negative (deny) paths that
// the app UI can't exercise on its own, plus the positive paths that must keep
// working. Runs against the real Firestore + Auth emulators using the same
// `firebase` client SDK the app uses, so it tests the rules exactly as deployed.
//
// Not part of the jsdom unit suite (it needs the emulators and the network); it
// runs via `npm run test:rules`, which wraps this in `firebase emulators:exec`
// and points vitest at vitest.rules.config.ts. tests/rules/** is excluded from
// the main vitest config.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  type Firestore
} from 'firebase/firestore';
import {
  seedUsers,
  clearFirestore,
  adminPutIteration,
  PROJECT_ID,
  PRO_USER,
  FREE_USER
} from '../../e2e/support/emulator';

const AUTH_HOST = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

const apps: FirebaseApp[] = [];

/** A Firestore client authenticated as the given seeded user (or anonymous when
 *  omitted), wired to the emulators. */
async function clientFor(user?: { email: string; password: string }): Promise<Firestore> {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' }, `c-${apps.length}`);
  apps.push(app);
  const auth: Auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_HOST, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS_HOST, Number(FS_PORT));
  if (user) await signInWithEmailAndPassword(auth, user.email, user.password);
  return db;
}

/** A schema-valid iteration document owned by `uid`. */
function validDoc(uid: string, over: Record<string, unknown> = {}) {
  return {
    ownerUid: uid,
    title: 'T',
    delivered: {},
    freeze: {},
    history: [],
    createdAt: 1,
    updatedAt: 1,
    ...over
  };
}

/** Assert a Firestore operation is rejected by the security rules. Matches on the
 *  FirebaseError code, which is a stable `permission-denied` for both denied
 *  reads (whose message is the rule-evaluation trace) and writes. */
async function denied(op: Promise<unknown>) {
  await expect(op).rejects.toHaveProperty('code', 'permission-denied');
}

beforeAll(async () => {
  await seedUsers();
});

beforeEach(async () => {
  await clearFirestore();
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => deleteApp(a)));
});

describe('firestore.rules — iterations', () => {
  it('denies all access to an unauthenticated caller (no anonymous access)', async () => {
    const anon = await clientFor();
    await denied(getDoc(doc(anon, 'iterations', 'anything')));
    await denied(setDoc(doc(anon, 'iterations', 'x'), validDoc('nobody')));
  });

  it('lets a Pro owner create their own iteration', async () => {
    const pro = await clientFor(PRO_USER);
    await expect(
      setDoc(doc(pro, 'iterations', 'p1'), validDoc(PRO_USER.uid))
    ).resolves.toBeUndefined();
  });

  it('denies cloud writes to a free (non-Pro) user', async () => {
    const free = await clientFor(FREE_USER);
    await denied(setDoc(doc(free, 'iterations', 'f1'), validDoc(FREE_USER.uid)));
  });

  it('lets a signed-in user get a non-existent doc (returns null) — the sync existence probe', async () => {
    const pro = await clientFor(PRO_USER);
    const snap = await getDoc(doc(pro, 'iterations', 'does-not-exist'));
    expect(snap.exists()).toBe(false);
  });

  it("denies reading another user's iteration", async () => {
    await adminPutIteration(PRO_USER.uid, 'p1', 'Pro doc');
    const free = await clientFor(FREE_USER);
    await denied(getDoc(doc(free, 'iterations', 'p1')));
  });

  it("denies a Pro user overwriting another user's iteration", async () => {
    await adminPutIteration(FREE_USER.uid, 'f1', 'Free doc');
    const pro = await clientFor(PRO_USER);
    await denied(setDoc(doc(pro, 'iterations', 'f1'), validDoc(PRO_USER.uid)));
  });

  it('denies creating a doc owned by someone else (ownerUid must be the caller)', async () => {
    const pro = await clientFor(PRO_USER);
    await denied(setDoc(doc(pro, 'iterations', 'x'), validDoc(FREE_USER.uid)));
  });

  it('denies the owner reassigning ownerUid on update', async () => {
    const pro = await clientFor(PRO_USER);
    await setDoc(doc(pro, 'iterations', 'p1'), validDoc(PRO_USER.uid));
    await denied(
      setDoc(doc(pro, 'iterations', 'p1'), validDoc(FREE_USER.uid, { title: 'renamed' }))
    );
  });

  it('rejects malformed writes (schema validation)', async () => {
    const pro = await clientFor(PRO_USER);
    // Empty title.
    await denied(setDoc(doc(pro, 'iterations', 'a'), validDoc(PRO_USER.uid, { title: '' })));
    // Wrong type for a tracked field.
    await denied(setDoc(doc(pro, 'iterations', 'b'), validDoc(PRO_USER.uid, { history: 'nope' })));
    // Unknown extra key.
    await denied(setDoc(doc(pro, 'iterations', 'c'), validDoc(PRO_USER.uid, { evil: true })));
  });

  it('lets a downgraded (free) owner still read and delete their own data', async () => {
    await adminPutIteration(FREE_USER.uid, 'f1', 'Free-owned');
    const free = await clientFor(FREE_USER);
    const snap = await getDoc(doc(free, 'iterations', 'f1'));
    expect(snap.data()?.title).toBe('Free-owned');
    await expect(deleteDoc(doc(free, 'iterations', 'f1'))).resolves.toBeUndefined();
  });

  it("denies deleting another user's iteration", async () => {
    await adminPutIteration(PRO_USER.uid, 'p1', 'Pro doc');
    const free = await clientFor(FREE_USER);
    await denied(deleteDoc(doc(free, 'iterations', 'p1')));
  });
});
