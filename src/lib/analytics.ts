// Google Analytics (GA4) via Firebase Analytics — the impure shell.
//
// Firebase ships GA4 out of the box; there is no separate Google Analytics
// property to wire up beyond a measurement id. This module lazily loads
// `firebase/analytics` (dynamic import, so it stays out of the initial bundle,
// like xlsx.ts) and implements Google **Consent Mode v2**:
//
//   * Analytics initialises with consent DENIED by default (see consent.ts), so
//     the tag loads in cookieless mode and collects nothing until the user opts
//     in — the GDPR-safe default.
//   * Opting in flips analytics_storage to 'granted'; opting out flips it back.
//   * Ad signals (ad_storage, ad_user_data, ad_personalization) are ALWAYS
//     denied — this app has no advertising.
//
// The pure decision/persistence logic lives in consent.ts; this file is the
// side-effecting edge that talks to the SDK.

import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { consentSettings, readConsent, writeConsent, type ConsentChoice } from './consent';

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

type AnalyticsInstance = import('firebase/analytics').Analytics;

let instance: AnalyticsInstance | null = null;
let initStarted = false;

/** Analytics can run only when Firebase is configured AND a GA4 measurement id
 *  was provided at build time. Otherwise every entry point below no-ops. */
export function isAnalyticsConfigured(): boolean {
  return isFirebaseConfigured() && Boolean(measurementId);
}

/**
 * Initialise analytics once, in Consent Mode v2. Safe to call unconditionally
 * and repeatedly: it no-ops when analytics is not configured or the browser is
 * unsupported, and only ever boots the SDK a single time.
 *
 * The default consent (the stored choice, or DENIED when unset) is applied
 * BEFORE the SDK initialises, so nothing is collected until the user opts in.
 */
export async function initAnalytics(): Promise<AnalyticsInstance | null> {
  if (initStarted) return instance;
  initStarted = true;
  if (!isAnalyticsConfigured()) return null;

  const { getAnalytics, isSupported, setConsent } = await import('firebase/analytics');
  if (!(await isSupported())) return null;

  // Consent Mode v2: establish the default consent state before the tag boots.
  setConsent(consentSettings(readConsent()));
  instance = getAnalytics(getFirebaseApp());
  return instance;
}

/**
 * Record the user's analytics choice: persist it and push it to gtag. Granting
 * also boots the SDK if it is not already up (it then respects the granted
 * state). Persistence still happens even when analytics is not configured, so
 * the choice is remembered if a measurement id is added later.
 */
export async function setAnalyticsConsent(choice: ConsentChoice): Promise<void> {
  writeConsent(choice);
  if (!isAnalyticsConfigured()) return;
  await initAnalytics();
  const { setConsent } = await import('firebase/analytics');
  setConsent(consentSettings(choice));
}

/** Log a custom GA4 event. No-op until analytics has initialised (Consent Mode
 *  then gates collection according to the user's choice). */
export async function track(name: string, params?: Record<string, unknown>): Promise<void> {
  if (!instance) return;
  const { logEvent } = await import('firebase/analytics');
  logEvent(instance, name, params);
}

/** Log a GA4 screen_view for the given app view. */
export function trackPageView(screen: string): Promise<void> {
  return track('screen_view', {
    firebase_screen: screen,
    firebase_screen_class: screen
  });
}
