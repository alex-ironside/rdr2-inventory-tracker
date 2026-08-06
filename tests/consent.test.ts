import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CONSENT_KEY,
  readConsent,
  writeConsent,
  consentSettings
} from '../src/lib/consent';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readConsent', () => {
  it("returns 'unset' when nothing is stored", () => {
    expect(readConsent()).toBe('unset');
  });

  it("reads a stored 'granted' choice", () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    expect(readConsent()).toBe('granted');
  });

  it("reads a stored 'denied' choice", () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    expect(readConsent()).toBe('denied');
  });

  it("treats an unrecognised stored value as 'unset'", () => {
    localStorage.setItem(CONSENT_KEY, 'maybe');
    expect(readConsent()).toBe('unset');
  });

  it("returns 'unset' when storage throws", () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readConsent()).toBe('unset');
  });
});

describe('writeConsent', () => {
  it('persists the choice', () => {
    writeConsent('granted');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    writeConsent('denied');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
  });

  it('swallows storage failures', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeConsent('granted')).not.toThrow();
  });
});

describe('consentSettings', () => {
  it('grants analytics_storage only for an explicit grant; ads always denied', () => {
    expect(consentSettings('granted')).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  });

  it("denies analytics_storage for 'denied' and 'unset'", () => {
    expect(consentSettings('denied').analytics_storage).toBe('denied');
    expect(consentSettings('unset').analytics_storage).toBe('denied');
  });
});
