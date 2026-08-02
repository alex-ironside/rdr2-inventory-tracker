import { describe, it, expect } from 'vitest';
import { detectPlatform, isStandalone, installAffordance } from '../src/lib/install';

describe('detectPlatform', () => {
  it('detects iPhone / iPad / iPod as ios', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(detectPlatform('… iPad …')).toBe('ios');
  });

  it('detects Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
  });

  it('treats a touch Macintosh (iPadOS 13+) as ios', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe('ios');
  });

  it('treats a non-touch Macintosh as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0)).toBe('desktop');
  });

  it('defaults to desktop and tolerates empty input', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
    expect(detectPlatform('')).toBe('desktop');
  });
});

describe('isStandalone', () => {
  it('is true when display-mode is standalone', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true);
  });

  it('is true for iOS navigator.standalone', () => {
    expect(isStandalone({ navigatorStandalone: true })).toBe(true);
  });

  it('is false when neither signal is set', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandalone({})).toBe(false);
  });
});

describe('installAffordance', () => {
  it('shows nothing when already installed', () => {
    expect(
      installAffordance({ standalone: true, platform: 'android', hasDeferredPrompt: true })
    ).toBe('none');
  });

  it('prefers the native prompt when available', () => {
    expect(
      installAffordance({ standalone: false, platform: 'android', hasDeferredPrompt: true })
    ).toBe('prompt');
  });

  it('shows iOS instructions when there is no native prompt on iOS', () => {
    expect(
      installAffordance({ standalone: false, platform: 'ios', hasDeferredPrompt: false })
    ).toBe('ios-instructions');
  });

  it('shows nothing on desktop with no prompt', () => {
    expect(
      installAffordance({ standalone: false, platform: 'desktop', hasDeferredPrompt: false })
    ).toBe('none');
  });
});
