// Pure platform-detection + install-eligibility logic for the PWA install CTA.
// Android/Chromium expose a `beforeinstallprompt` event we can trigger;
// iOS Safari has no such API, so users must use Share → "Add to Home Screen".

export type Platform = 'ios' | 'android' | 'desktop';

/** Detect the platform from a user-agent string. `maxTouchPoints` disambiguates
 *  iPadOS 13+, which reports a Macintosh UA. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const s = (ua || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  if (/android/.test(s)) return 'android';
  if (/macintosh/.test(s) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

export interface StandaloneEnv {
  matchMedia?: (q: string) => { matches: boolean };
  navigatorStandalone?: boolean;
}

/** True when the app is already running as an installed PWA (so no CTA needed). */
export function isStandalone(env: StandaloneEnv): boolean {
  const displayMode = env.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const iosStandalone = env.navigatorStandalone === true;
  return displayMode || iosStandalone;
}

/** Which install affordance (if any) to surface.
 *   - 'prompt'       → a native install prompt is available (Android/desktop Chromium)
 *   - 'ios-instructions' → show manual Add-to-Home-Screen steps
 *   - 'none'         → already installed, or no path available */
export type InstallAffordance = 'prompt' | 'ios-instructions' | 'none';

export function installAffordance(opts: {
  standalone: boolean;
  platform: Platform;
  hasDeferredPrompt: boolean;
}): InstallAffordance {
  if (opts.standalone) return 'none';
  if (opts.hasDeferredPrompt) return 'prompt';
  if (opts.platform === 'ios') return 'ios-instructions';
  return 'none';
}
