import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const initializeApp = vi.fn(() => ({ __app: true }));
const getAuth = vi.fn(() => ({ __auth: true }));
const initializeFirestore = vi.fn(() => ({ __db: true }));
const persistentLocalCache = vi.fn(() => ({ __cache: true }));
const persistentMultipleTabManager = vi.fn(() => ({ __tabs: true }));

vi.mock('firebase/app', () => ({ initializeApp }));
vi.mock('firebase/auth', () => ({ getAuth }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
}));

const ENV_KEYS = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'd.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'proj',
  VITE_FIREBASE_STORAGE_BUCKET: 'b',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 's',
  VITE_FIREBASE_APP_ID: 'app'
};

function stubConfig() {
  for (const [k, v] of Object.entries(ENV_KEYS)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe('firebase (unconfigured)', () => {
  it('reports not configured and throws when accessed', async () => {
    const mod = await import('../src/lib/firebase');
    expect(mod.isFirebaseConfigured()).toBe(false);
    expect(() => mod.getFirebaseAuth()).toThrow(/not configured/i);
    expect(() => mod.getDb()).toThrow(/not configured/i);
    expect(initializeApp).not.toHaveBeenCalled();
  });
});

describe('firebase (configured)', () => {
  it('reports configured', async () => {
    stubConfig();
    const mod = await import('../src/lib/firebase');
    expect(mod.isFirebaseConfigured()).toBe(true);
  });

  it('initialises the app once and caches auth + db singletons', async () => {
    stubConfig();
    const mod = await import('../src/lib/firebase');

    const auth1 = mod.getFirebaseAuth();
    const auth2 = mod.getFirebaseAuth();
    const db1 = mod.getDb();
    const db2 = mod.getDb();

    expect(auth1).toBe(auth2);
    expect(db1).toBe(db2);
    // App created exactly once despite multiple accessors.
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(initializeFirestore).toHaveBeenCalledTimes(1);
    // Firestore initialised with persistent offline cache.
    expect(persistentLocalCache).toHaveBeenCalledOnce();
    expect(persistentMultipleTabManager).toHaveBeenCalledOnce();
  });
});
