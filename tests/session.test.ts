import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from 'firebase/auth';

// Hoisted mock state shared with the mock factories.
const h = vi.hoisted(() => ({
  configured: true,
  currentUser: null as unknown,
  authCallback: null as ((user: User | null) => void) | null,
  signInImpl: vi.fn(async () => ({ user: { uid: 'u1' } })),
  signUpImpl: vi.fn(async () => ({ user: { uid: 'u1' } })),
  signOutImpl: vi.fn(async () => undefined),
  deleteUserImpl: vi.fn(async () => undefined),
  reauthImpl: vi.fn(async () => undefined),
  setPersistence: vi.fn(async () => undefined),
  onAuthStateChanged: vi.fn(),
  cloudItems: [] as Array<{ id: string }>,
  deleted: [] as string[]
}));

vi.mock('../src/lib/firebase', () => ({
  isFirebaseConfigured: () => h.configured,
  getFirebaseAuth: () => ({
    get currentUser() {
      return h.currentUser;
    }
  })
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (_a: unknown, email: string, pw: string) => h.signInImpl(email, pw),
  createUserWithEmailAndPassword: (_a: unknown, email: string, pw: string) =>
    h.signUpImpl(email, pw),
  signOut: () => h.signOutImpl(),
  deleteUser: (u: unknown) => h.deleteUserImpl(u),
  reauthenticateWithCredential: (u: unknown, c: unknown) => h.reauthImpl(u, c),
  EmailAuthProvider: { credential: (email: string, pw: string) => ({ email, pw }) },
  setPersistence: () => h.setPersistence(),
  browserLocalPersistence: { __persist: true },
  onAuthStateChanged: (_auth: unknown, cb: (u: User | null) => void) => {
    h.authCallback = cb;
    h.onAuthStateChanged();
    return () => undefined;
  }
}));

// Fake FirebaseBackend (no network); keep the real LocalBackend.
vi.mock('../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/storage')>();
  return {
    ...actual,
    FirebaseBackend: class {
      readonly mode = 'firebase' as const;
      constructor(public uid: string) {}
      async listIterations() {
        return h.cloudItems;
      }
      async deleteIteration(id: string) {
        h.deleted.push(id);
      }
    }
  };
});

const LOCAL_FLAG = 'rdr2-tracker:mode-local';
const flush = () => new Promise((r) => setTimeout(r));

/** A mock Firebase user whose ID token carries (or not) the Pro claim. */
function mockUser(uid: string, pro: boolean, email = 'me@example.com'): User {
  return {
    uid,
    email,
    getIdTokenResult: async () => ({ claims: pro ? { stripeRole: 'pro' } : {} })
  } as unknown as User;
}

async function loadSession() {
  vi.resetModules();
  const mod = await import('../src/lib/session.svelte');
  return mod.session;
}

beforeEach(() => {
  localStorage.clear();
  h.configured = true;
  h.currentUser = null;
  h.authCallback = null;
  h.cloudItems = [];
  h.deleted = [];
  h.signInImpl.mockReset().mockResolvedValue({ user: { uid: 'u1' } });
  h.signUpImpl.mockReset().mockResolvedValue({ user: { uid: 'u1' } });
  h.signOutImpl.mockReset().mockResolvedValue(undefined);
  h.deleteUserImpl.mockReset().mockResolvedValue(undefined);
  h.reauthImpl.mockReset().mockResolvedValue(undefined);
  h.setPersistence.mockReset().mockResolvedValue(undefined);
  h.onAuthStateChanged.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Session with Firebase available', () => {
  it('registers an auth listener and is not ready until it fires', async () => {
    const session = await loadSession();
    expect(session.firebaseAvailable).toBe(true);
    expect(h.onAuthStateChanged).toHaveBeenCalled();
    expect(session.ready).toBe(false);
  });

  it('becomes ready with no user when the listener reports signed-out', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    expect(session.ready).toBe(true);
    expect(session.mode).toBeNull();
    expect(session.isAuthenticated).toBe(false);
    expect(session.signedIn).toBe(false);
  });

  it('signs in and gives a Pro user the cloud (firebase) backend', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    const ok = await session.signIn(' me@example.com ', 'pw');
    expect(ok).toBe(true);
    expect(h.setPersistence).toHaveBeenCalled();
    expect(h.signInImpl).toHaveBeenCalledWith('me@example.com', 'pw');

    h.authCallback!(mockUser('u1', true));
    await flush();
    expect(session.mode).toBe('firebase');
    expect(session.backend?.mode).toBe('firebase');
    expect(session.pro).toBe(true);
    expect(session.isAuthenticated).toBe(true);
    expect(session.canUpgrade).toBe(false);
  });

  it('keeps a signed-in free user on the local backend and offers upgrade', async () => {
    const session = await loadSession();
    h.authCallback!(mockUser('u1', false));
    await flush();
    expect(session.signedIn).toBe(true);
    expect(session.pro).toBe(false);
    expect(session.mode).toBe('local');
    expect(session.backend?.mode).toBe('local');
    expect(session.canUpgrade).toBe(true);
  });

  it('treats a token-read failure as free (fails closed)', async () => {
    const session = await loadSession();
    const broken = {
      uid: 'u1',
      email: 'x@y.z',
      getIdTokenResult: async () => {
        throw new Error('network');
      }
    } as unknown as User;
    h.authCallback!(broken);
    await flush();
    expect(session.pro).toBe(false);
    expect(session.mode).toBe('local');
  });

  it('signs up a new account', async () => {
    const session = await loadSession();
    const ok = await session.signUp('new@example.com', 'secret1');
    expect(ok).toBe(true);
    expect(h.signUpImpl).toHaveBeenCalledWith('new@example.com', 'secret1');
  });

  it('surfaces a friendly error when sign-up email is taken', async () => {
    const session = await loadSession();
    h.signUpImpl.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
    const ok = await session.signUp('taken@example.com', 'secret1');
    expect(ok).toBe(false);
    expect(session.authError).toMatch(/already exists/i);
  });

  it('surfaces a friendly error on failed sign in', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    h.signInImpl.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    const ok = await session.signIn('me@example.com', 'bad');
    expect(ok).toBe(false);
    expect(session.authError).toBe('Incorrect email or password.');
  });

  it('re-checks entitlement and flips a user to Pro after upgrade', async () => {
    const session = await loadSession();
    // Start free.
    const user = mockUser('u1', false);
    h.authCallback!(user);
    await flush();
    expect(session.pro).toBe(false);

    // After purchase the claim is present; refresh picks it up.
    (user as unknown as { getIdTokenResult: () => Promise<unknown> }).getIdTokenResult = async () => ({
      claims: { stripeRole: 'pro' }
    });
    await session.refreshEntitlement();
    expect(session.pro).toBe(true);
    expect(session.mode).toBe('firebase');
  });

  it('refreshEntitlement is a no-op with no signed-in user', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    await session.refreshEntitlement();
    expect(session.pro).toBe(false);
  });

  it('signs out of firebase and calls Firebase signOut', async () => {
    const session = await loadSession();
    h.authCallback!(mockUser('u1', true));
    await flush();
    await session.signOut();
    expect(h.signOutImpl).toHaveBeenCalledOnce();
    expect(session.mode).toBeNull();
    expect(session.backend).toBeNull();
    expect(session.pro).toBe(false);
  });
});

describe('Session.deleteAccount', () => {
  it('reauthenticates, purges cloud data, deletes the user, and resets state', async () => {
    const session = await loadSession();
    const user = mockUser('u1', true);
    h.currentUser = user;
    h.cloudItems = [{ id: 'a' }, { id: 'b' }];
    h.authCallback!(user);
    await flush();

    const ok = await session.deleteAccount('secret1');
    expect(ok).toBe(true);
    expect(h.reauthImpl).toHaveBeenCalledOnce();
    expect(h.deleted.sort()).toEqual(['a', 'b']);
    expect(h.deleteUserImpl).toHaveBeenCalledOnce();
    expect(session.user).toBeNull();
    expect(session.mode).toBeNull();
  });

  it('fails with a friendly message when reauthentication is rejected', async () => {
    const session = await loadSession();
    h.currentUser = mockUser('u1', true);
    h.reauthImpl.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    const ok = await session.deleteAccount('bad');
    expect(ok).toBe(false);
    expect(session.authError).toBe('Incorrect email or password.');
    expect(h.deleteUserImpl).not.toHaveBeenCalled();
  });

  it('deletes an account that has no email on record', async () => {
    const session = await loadSession();
    h.currentUser = { uid: 'u1', email: null } as unknown as User;
    const ok = await session.deleteAccount('secret1');
    expect(ok).toBe(true);
    expect(h.deleteUserImpl).toHaveBeenCalledOnce();
  });

  it('refuses to delete when no user is signed in', async () => {
    const session = await loadSession();
    h.currentUser = null;
    const ok = await session.deleteAccount('whatever');
    expect(ok).toBe(false);
    expect(session.authError).toMatch(/not signed in/i);
  });
});

describe('Session DEV_FORCE_PRO override', () => {
  it('forces Pro for a signed-in user in a dev build', async () => {
    vi.stubEnv('VITE_DEV_FORCE_PRO', '1');
    const session = await loadSession();
    // A user whose claim says NOT pro is still forced to Pro in dev.
    h.authCallback!(mockUser('u1', false));
    await flush();
    expect(session.pro).toBe(true);
    expect(session.mode).toBe('firebase');
  });
});

describe('Session with Firebase unavailable', () => {
  beforeEach(() => {
    h.configured = false;
  });

  it('is immediately ready in an unconfigured build', async () => {
    const session = await loadSession();
    expect(session.firebaseAvailable).toBe(false);
    expect(session.ready).toBe(true);
  });

  it('refuses sign in and explains why', async () => {
    const session = await loadSession();
    const ok = await session.signIn('a@b.c', 'x');
    expect(ok).toBe(false);
    expect(session.authError).toMatch(/not configured/i);
  });

  it('refuses sign up and delete when unconfigured', async () => {
    const session = await loadSession();
    expect(await session.signUp('a@b.c', 'x')).toBe(false);
    expect(session.authError).toMatch(/not configured/i);
    expect(await session.deleteAccount('x')).toBe(false);
    expect(session.authError).toMatch(/not configured/i);
  });

  it('enters local mode and authenticates without an account', async () => {
    const session = await loadSession();
    session.enterLocalMode();
    expect(session.mode).toBe('local');
    expect(session.backend?.mode).toBe('local');
    expect(session.isAuthenticated).toBe(true);
    expect(session.signedIn).toBe(false);
    expect(localStorage.getItem(LOCAL_FLAG)).toBe('1');
  });

  it('signing out of local mode does not call Firebase', async () => {
    const session = await loadSession();
    session.enterLocalMode();
    await session.signOut();
    expect(h.signOutImpl).not.toHaveBeenCalled();
    expect(session.mode).toBeNull();
    expect(localStorage.getItem(LOCAL_FLAG)).toBeNull();
  });
});

describe('Session restoring a saved local-mode choice', () => {
  it('restores local mode on construction and ignores later auth callbacks', async () => {
    localStorage.setItem(LOCAL_FLAG, '1');
    const session = await loadSession();
    expect(session.mode).toBe('local');
    expect(session.ready).toBe(true);
    // An auth callback must not override an explicit local-mode choice.
    h.authCallback!(mockUser('u1', true));
    await flush();
    expect(session.mode).toBe('local');
  });
});
