import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from 'firebase/auth';

// Hoisted mock state shared with the mock factories.
const h = vi.hoisted(() => ({
  configured: true,
  authCallback: null as ((user: User | null) => void) | null,
  signInImpl: vi.fn(async () => ({ user: { uid: 'u1' } })),
  signOutImpl: vi.fn(async () => undefined),
  setPersistence: vi.fn(async () => undefined),
  onAuthStateChanged: vi.fn()
}));

vi.mock('../src/lib/firebase', () => ({
  isFirebaseConfigured: () => h.configured,
  getFirebaseAuth: () => ({ __auth: true })
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (_a: unknown, email: string, pw: string) => h.signInImpl(email, pw),
  signOut: () => h.signOutImpl(),
  setPersistence: () => h.setPersistence(),
  browserLocalPersistence: { __persist: true },
  onAuthStateChanged: (_auth: unknown, cb: (u: User | null) => void) => {
    h.authCallback = cb;
    h.onAuthStateChanged();
    return () => undefined;
  }
}));

const LOCAL_FLAG = 'rdr2-tracker:mode-local';

async function loadSession() {
  vi.resetModules();
  const mod = await import('../src/lib/session.svelte');
  return mod.session;
}

beforeEach(() => {
  localStorage.clear();
  h.configured = true;
  h.authCallback = null;
  h.signInImpl.mockReset().mockResolvedValue({ user: { uid: 'u1' } });
  h.signOutImpl.mockReset().mockResolvedValue(undefined);
  h.setPersistence.mockReset().mockResolvedValue(undefined);
  h.onAuthStateChanged.mockReset();
});
afterEach(() => vi.restoreAllMocks());

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
  });

  it('signs in successfully and switches to firebase mode on auth change', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    const ok = await session.signIn(' me@example.com ', 'pw');
    expect(ok).toBe(true);
    expect(h.setPersistence).toHaveBeenCalled();
    expect(h.signInImpl).toHaveBeenCalledWith('me@example.com', 'pw');

    // Simulate Firebase notifying us of the signed-in user.
    h.authCallback!({ uid: 'u1', email: 'me@example.com' } as User);
    expect(session.mode).toBe('firebase');
    expect(session.backend?.mode).toBe('firebase');
    expect(session.isAuthenticated).toBe(true);
  });

  it('surfaces a friendly error on failed sign in', async () => {
    const session = await loadSession();
    h.authCallback!(null);
    h.signInImpl.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    const ok = await session.signIn('me@example.com', 'bad');
    expect(ok).toBe(false);
    expect(session.authError).toBe('Incorrect email or password.');
  });

  it('signs out of firebase mode', async () => {
    const session = await loadSession();
    h.authCallback!({ uid: 'u1' } as User);
    await session.signOut();
    expect(h.signOutImpl).toHaveBeenCalledOnce();
    expect(session.mode).toBeNull();
    expect(session.backend).toBeNull();
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

  it('enters local mode and authenticates without an account', async () => {
    const session = await loadSession();
    session.enterLocalMode();
    expect(session.mode).toBe('local');
    expect(session.backend?.mode).toBe('local');
    expect(session.isAuthenticated).toBe(true);
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
    h.authCallback!({ uid: 'u1' } as User);
    expect(session.mode).toBe('local');
  });
});
