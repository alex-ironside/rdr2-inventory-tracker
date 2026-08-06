// Analytics consent (GDPR / Google Consent Mode v2). Pure logic only: reading
// and persisting the user's choice, and mapping it to the gtag consent signals.
// The impure shell (analytics.ts) applies these to Firebase Analytics.
//
// This app shows no ads, so the ad_* signals are always denied; only
// analytics_storage tracks the user's decision. Before the user opts in the
// state is 'unset', which the settings mapper treats as denied — nothing is
// collected until an explicit opt-in (Consent Mode v2's default-denied model).

export type ConsentChoice = 'granted' | 'denied';
export type ConsentState = ConsentChoice | 'unset';

/** The subset of gtag consent parameters we drive. The index signature keeps
 *  this structurally compatible with Firebase's `ConsentSettings`. */
export interface ConsentSettings {
  analytics_storage: ConsentChoice;
  ad_storage: 'denied';
  ad_user_data: 'denied';
  ad_personalization: 'denied';
  [key: string]: ConsentChoice;
}

export const CONSENT_KEY = 'rdr2-tracker:analytics-consent';

/** The stored choice, or 'unset' when the user has not decided (or storage is
 *  unavailable) so the UI knows to ask. */
export function readConsent(): ConsentState {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

/** Persist the user's choice. Storage failures are non-fatal — the choice then
 *  applies for this session only. */
export function writeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* storage unavailable — consent applies for this session only */
  }
}

/** Map a consent state to the full gtag settings. Anything other than an
 *  explicit 'granted' denies analytics_storage; ad signals are always denied. */
export function consentSettings(state: ConsentState): ConsentSettings {
  return {
    analytics_storage: state === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  };
}
