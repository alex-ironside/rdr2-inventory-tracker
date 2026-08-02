// Reactive session: which storage backend is active and (for Firebase) who is
// signed in. Uses Svelte 5 runes so components can read `session.*` directly.

import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type User
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { FirebaseBackend, LocalBackend, type StorageBackend } from './storage';
import { friendlyAuthError } from './auth-errors';
import type { StorageMode } from './types';

const LOCAL_FLAG = 'rdr2-tracker:mode-local';

class Session {
  /** null until we know the initial auth/mode state. */
  ready = $state(false);
  user = $state<User | null>(null);
  mode = $state<StorageMode | null>(null);
  backend = $state<StorageBackend | null>(null);
  authError = $state<string | null>(null);
  firebaseAvailable = isFirebaseConfigured();

  constructor() {
    // If the user previously chose offline mode, restore it without waiting on
    // Firebase.
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_FLAG) === '1') {
      this.enterLocalMode();
    }

    if (this.firebaseAvailable) {
      const auth = getFirebaseAuth();
      onAuthStateChanged(auth, (user) => {
        // Local mode wins if explicitly chosen.
        if (this.mode === 'local') {
          this.ready = true;
          return;
        }
        // Reaching here means local mode is not active (handled above).
        this.user = user;
        if (user) {
          this.mode = 'firebase';
          this.backend = new FirebaseBackend(user.uid);
        } else {
          this.mode = null;
          this.backend = null;
        }
        this.ready = true;
      });
    } else {
      this.ready = true;
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    this.authError = null;
    if (!this.firebaseAvailable) {
      this.authError = 'Firebase is not configured for this build.';
      return false;
    }
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (err) {
      this.authError = friendlyAuthError(err);
      return false;
    }
  }

  enterLocalMode(): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCAL_FLAG, '1');
    this.mode = 'local';
    this.backend = new LocalBackend();
    this.user = null;
    this.ready = true;
  }

  async signOut(): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_FLAG);
    const wasFirebase = this.mode === 'firebase';
    this.mode = null;
    this.backend = null;
    this.user = null;
    if (wasFirebase && this.firebaseAvailable) {
      await fbSignOut(getFirebaseAuth());
    }
  }

  get isAuthenticated(): boolean {
    return this.mode === 'local' || (this.mode === 'firebase' && !!this.user);
  }
}

export const session = new Session();
