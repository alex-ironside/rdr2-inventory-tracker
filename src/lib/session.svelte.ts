// Reactive session: which storage backend is active, who is signed in, and
// whether they have Pro (cloud sync is Pro-only).
//
// Backend selection (see pro-cloud-sync monetization):
//   * explicit offline           → LocalBackend  (no account)
//   * signed in, NOT Pro         → LocalBackend  (free tier; prompt to upgrade)
//   * signed in, Pro             → FirebaseBackend (cloud sync)
//
// Entitlement rides on the ID-token claim `stripeRole` (set by the Stripe
// extension); entitlement.ts turns claims into a boolean and firestore.rules
// enforces the same claim server-side.

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type User
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { FirebaseBackend, LocalBackend, type StorageBackend } from './storage';
import { friendlyAuthError } from './auth-errors';
import { entitlementFromClaims } from './entitlement';
import type { StorageMode } from './types';

const LOCAL_FLAG = 'rdr2-tracker:mode-local';

// Dev-only escape hatch: on Spark the Stripe extension can't set the Pro claim,
// so `VITE_DEV_FORCE_PRO=1` forces the Pro path when running a dev build. Gated
// behind import.meta.env.DEV so it can never be enabled in a production build.
const DEV_FORCE_PRO = import.meta.env.DEV && import.meta.env.VITE_DEV_FORCE_PRO === '1';

class Session {
  /** false until we know the initial auth/mode state. */
  ready = $state(false);
  user = $state<User | null>(null);
  /** True when the signed-in user has an active Pro entitlement (cloud sync). */
  pro = $state(false);
  mode = $state<StorageMode | null>(null);
  backend = $state<StorageBackend | null>(null);
  authError = $state<string | null>(null);
  firebaseAvailable = isFirebaseConfigured();

  /** True only when the user explicitly chose offline mode (distinct from a
   *  signed-in free user, who also runs on LocalBackend). */
  private offlineChosen = false;

  constructor() {
    // Restore an explicit offline choice without waiting on Firebase.
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_FLAG) === '1') {
      this.enterLocalMode();
    }

    if (this.firebaseAvailable) {
      onAuthStateChanged(getFirebaseAuth(), (user) => void this.applyUser(user));
    } else {
      this.ready = true;
    }
  }

  /** Reconcile session state to an auth user, choosing the backend by Pro. */
  private async applyUser(user: User | null, forceRefresh = false): Promise<void> {
    // An explicit offline choice wins over any auth state.
    if (this.offlineChosen) {
      this.ready = true;
      return;
    }
    this.user = user;
    if (user) {
      this.pro = await this.resolvePro(user, forceRefresh);
      if (this.pro) {
        this.mode = 'firebase';
        this.backend = new FirebaseBackend(user.uid);
      } else {
        this.mode = 'local';
        this.backend = new LocalBackend();
      }
    } else {
      this.pro = false;
      this.mode = null;
      this.backend = null;
    }
    this.ready = true;
  }

  /** Read the Pro entitlement from the user's ID-token claim (fails closed). */
  private async resolvePro(user: User, forceRefresh: boolean): Promise<boolean> {
    if (DEV_FORCE_PRO) return true;
    try {
      const res = await user.getIdTokenResult(forceRefresh);
      return entitlementFromClaims(res.claims).pro;
    } catch {
      return false;
    }
  }

  /** Re-check entitlement (e.g. after returning from Stripe Checkout), forcing a
   *  token refresh so a freshly-granted Pro claim is picked up. */
  async refreshEntitlement(): Promise<void> {
    if (this.user) await this.applyUser(this.user, true);
  }

  async signIn(email: string, password: string): Promise<boolean> {
    return this.authenticate(signInWithEmailAndPassword, email, password);
  }

  async signUp(email: string, password: string): Promise<boolean> {
    return this.authenticate(createUserWithEmailAndPassword, email, password);
  }

  /** Shared email/password flow for sign-in and sign-up. */
  private async authenticate(
    fn: typeof signInWithEmailAndPassword,
    email: string,
    password: string
  ): Promise<boolean> {
    this.authError = null;
    if (!this.firebaseAvailable) {
      this.authError = 'Firebase is not configured for this build.';
      return false;
    }
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserLocalPersistence);
      await fn(auth, email.trim(), password);
      return true;
    } catch (err) {
      this.authError = friendlyAuthError(err);
      return false;
    }
  }

  enterLocalMode(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCAL_FLAG, '1');
    this.offlineChosen = true;
    this.mode = 'local';
    this.backend = new LocalBackend();
    this.user = null;
    this.pro = false;
    this.ready = true;
  }

  async signOut(): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_FLAG);
    const hadFirebaseUser = !!this.user;
    this.offlineChosen = false;
    this.mode = null;
    this.backend = null;
    this.user = null;
    this.pro = false;
    if (hadFirebaseUser && this.firebaseAvailable) {
      await fbSignOut(getFirebaseAuth());
    }
  }

  /**
   * Permanently delete the signed-in account: the user's cloud data first (so
   * nothing is orphaned), then the Firebase auth user (GDPR erasure). Firebase
   * requires a recent login, so the current password is used to re-authenticate.
   * Returns true on success; on failure sets `authError` and leaves the account
   * intact.
   */
  async deleteAccount(password: string): Promise<boolean> {
    this.authError = null;
    if (!this.firebaseAvailable) {
      this.authError = 'Firebase is not configured for this build.';
      return false;
    }
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      this.authError = 'You are not signed in.';
      return false;
    }
    try {
      const cred = EmailAuthProvider.credential(user.email ?? '', password);
      await reauthenticateWithCredential(user, cred);
      await this.purgeCloudData(user.uid);
      await deleteUser(user);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_FLAG);
      this.offlineChosen = false;
      this.user = null;
      this.pro = false;
      this.mode = null;
      this.backend = null;
      return true;
    } catch (err) {
      this.authError = friendlyAuthError(err);
      return false;
    }
  }

  /** Delete every cloud iteration owned by the user. */
  private async purgeCloudData(uid: string): Promise<void> {
    const backend = new FirebaseBackend(uid);
    const items = await backend.listIterations();
    await Promise.all(items.map((it) => backend.deleteIteration(it.id)));
  }

  get isAuthenticated(): boolean {
    return this.mode === 'local' || (this.mode === 'firebase' && !!this.user);
  }

  /** True when a Firebase account is signed in (Pro or free) — distinct from an
   *  anonymous offline session. Drives the upgrade / account UI. */
  get signedIn(): boolean {
    return !!this.user;
  }

  /** A signed-in free user who could unlock cloud sync by upgrading. */
  get canUpgrade(): boolean {
    return this.signedIn && !this.pro;
  }
}

export const session = new Session();
