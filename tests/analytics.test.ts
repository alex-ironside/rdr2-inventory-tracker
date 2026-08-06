import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONSENT_KEY } from '../src/lib/consent';

// Mock the lazily-imported Firebase Analytics SDK. The consts persist across
// vi.resetModules(), so assertions on them survive fresh module loads.
const getAnalytics = vi.fn(() => ({ __analytics: true }));
const isSupported = vi.fn(async () => true);
const setConsent = vi.fn();
const logEvent = vi.fn();
vi.mock('firebase/analytics', () => ({ getAnalytics, isSupported, setConsent, logEvent }));

// Control Firebase configuration without real env vars.
const isFirebaseConfigured = vi.fn(() => true);
const getFirebaseApp = vi.fn(() => ({ __app: true }));
vi.mock('../src/lib/firebase', () => ({ isFirebaseConfigured, getFirebaseApp }));

const DENIED_DEFAULT = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  isFirebaseConfigured.mockReturnValue(true);
  isSupported.mockResolvedValue(true);
  localStorage.clear();
  vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-TEST');
});
afterEach(() => vi.unstubAllEnvs());

async function load() {
  return import('../src/lib/analytics');
}

describe('isAnalyticsConfigured', () => {
  it('is true only when Firebase is configured and a measurement id is set', async () => {
    expect((await load()).isAnalyticsConfigured()).toBe(true);
  });

  it('is false without a measurement id', async () => {
    vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', '');
    expect((await load()).isAnalyticsConfigured()).toBe(false);
  });

  it('is false when Firebase is not configured', async () => {
    isFirebaseConfigured.mockReturnValue(false);
    expect((await load()).isAnalyticsConfigured()).toBe(false);
  });
});

describe('initAnalytics (Consent Mode v2)', () => {
  it('boots the SDK once with default-denied consent and caches the instance', async () => {
    const mod = await load();
    const a = await mod.initAnalytics();
    const b = await mod.initAnalytics();

    expect(a).toEqual({ __analytics: true });
    expect(b).toBe(a);
    // Consent default is applied BEFORE the tag initialises, denied by default.
    expect(setConsent).toHaveBeenCalledWith(DENIED_DEFAULT);
    expect(getAnalytics).toHaveBeenCalledTimes(1);
  });

  it('applies a previously granted choice as the initial consent', async () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    await (await load()).initAnalytics();
    expect(setConsent).toHaveBeenCalledWith({ ...DENIED_DEFAULT, analytics_storage: 'granted' });
  });

  it('no-ops when analytics is not configured', async () => {
    isFirebaseConfigured.mockReturnValue(false);
    expect(await (await load()).initAnalytics()).toBeNull();
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it('bails out on unsupported browsers without booting the SDK', async () => {
    isSupported.mockResolvedValue(false);
    expect(await (await load()).initAnalytics()).toBeNull();
    expect(isSupported).toHaveBeenCalled();
    expect(getAnalytics).not.toHaveBeenCalled();
    expect(setConsent).not.toHaveBeenCalled();
  });
});

describe('setAnalyticsConsent', () => {
  it('persists the choice and pushes a consent update, booting the SDK', async () => {
    const mod = await load();
    await mod.setAnalyticsConsent('granted');

    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    // Last call reflects the granted update.
    expect(setConsent).toHaveBeenLastCalledWith({
      ...DENIED_DEFAULT,
      analytics_storage: 'granted'
    });
  });

  it('persists the choice but does nothing to the SDK when not configured', async () => {
    isFirebaseConfigured.mockReturnValue(false);
    const mod = await load();
    await mod.setAnalyticsConsent('denied');

    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
    expect(setConsent).not.toHaveBeenCalled();
    expect(getAnalytics).not.toHaveBeenCalled();
  });
});

describe('track / trackPageView', () => {
  it('does nothing before analytics has initialised', async () => {
    const mod = await load();
    await mod.track('bulk_check');
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('logs a custom event once initialised', async () => {
    const mod = await load();
    const inst = await mod.initAnalytics();
    await mod.track('import_completed', { rows: 3 });
    expect(logEvent).toHaveBeenCalledWith(inst, 'import_completed', { rows: 3 });
  });

  it('logs a screen_view for a page view', async () => {
    const mod = await load();
    const inst = await mod.initAnalytics();
    await mod.trackPageView('tracker');
    expect(logEvent).toHaveBeenCalledWith(inst, 'screen_view', {
      firebase_screen: 'tracker',
      firebase_screen_class: 'tracker'
    });
  });
});
