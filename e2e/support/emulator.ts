// Admin-side helpers for the emulator e2e suite. Runs inside the Node process
// that Playwright is launched from — which itself is a child of
// `firebase emulators:exec`, so FIREBASE_AUTH_EMULATOR_HOST /
// FIRESTORE_EMULATOR_HOST are already in the environment and firebase-admin
// auto-connects to the local emulators (no real credentials involved).

import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'demo-rdr2';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

/** Seeded test accounts. The Pro user carries the real `stripeRole` custom claim
 *  the app and firestore.rules gate cloud sync on; the free user carries none,
 *  so it exercises the free/offline path and the rules' write-deny. */
export const PRO_USER = { email: 'pro@test.dev', password: 'passw0rd!', uid: 'pro-uid' };
export const FREE_USER = { email: 'free@test.dev', password: 'passw0rd!', uid: 'free-uid' };

function app(): App {
  return getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
}

/** Create the Pro and free users (idempotent) and stamp the Pro claim. Called
 *  from each test's setup, after the emulators are up. */
export async function seedUsers(): Promise<void> {
  const auth = getAuth(app());
  for (const u of [PRO_USER, FREE_USER]) {
    await auth.deleteUser(u.uid).catch(() => {}); // ignore "not found" on first run
    await auth.createUser({ uid: u.uid, email: u.email, password: u.password });
  }
  await auth.setCustomUserClaims(PRO_USER.uid, { stripeRole: 'pro' });
}

/** Wipe all Firestore documents between tests so each starts from a clean board.
 *  Uses the emulator's REST clear endpoint (leaves Auth users intact). */
export async function clearFirestore(): Promise<void> {
  const url = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`);
}

/** Titles of the cloud iterations a user owns — read server-side, so it proves
 *  data actually reached (or left) Firestore, not just the browser cache. */
export async function cloudIterationTitles(uid: string): Promise<string[]> {
  const snap = await getFirestore(app())
    .collection('iterations')
    .where('ownerUid', '==', uid)
    .get();
  return snap.docs.map((d) => d.data().title as string);
}

/** Write an iteration doc directly (bypassing rules) so a test can set up state
 *  a client wouldn't be allowed to create — e.g. a doc owned by a free user, to
 *  prove a downgraded owner can still read and delete their own data. */
export async function adminPutIteration(uid: string, id: string, title = 'Seeded'): Promise<void> {
  await getFirestore(app()).collection('iterations').doc(id).set({
    ownerUid: uid,
    title,
    delivered: {},
    freeze: {},
    history: [],
    createdAt: 1,
    updatedAt: 1
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stand in for the "Run Payments with Stripe" extension in the billing e2e. The
 * app writes a `customers/{uid}/checkout_sessions/{id}` doc and waits for the
 * extension to fill in `url` (or `error`). Here we poll for that doc and:
 *   - on success: grant the Pro claim (what the Stripe webhook does on payment)
 *     and write back `url` = the app's own `success_url`, so the browser
 *     redirects same-origin to `?checkout=success` and the app upgrades to Pro;
 *   - on error: write back an `error` so the UI surfaces it.
 */
export async function simulateStripeCheckout(
  uid: string,
  opts: { error?: string } = {}
): Promise<void> {
  const col = getFirestore(app()).collection('customers').doc(uid).collection('checkout_sessions');
  let session;
  for (let i = 0; i < 100 && !session; i++) {
    const snap = await col.limit(1).get();
    if (!snap.empty) session = snap.docs[0];
    else await sleep(100);
  }
  if (!session) throw new Error('timed out waiting for the client to start checkout');

  if (opts.error) {
    await session.ref.set({ error: { message: opts.error } }, { merge: true });
    return;
  }
  await getAuth(app()).setCustomUserClaims(uid, { stripeRole: 'pro' }); // the webhook's job
  await session.ref.set({ url: session.get('success_url') as string }, { merge: true });
}

/** Whether an Auth user still exists (used to verify GDPR account deletion). */
export async function userExists(uid: string): Promise<boolean> {
  return getAuth(app())
    .getUser(uid)
    .then(() => true)
    .catch(() => false);
}
