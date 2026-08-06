// Pro entitlement (pure). The single source of truth for "may this user use
// Firebase cloud sync?".
//
// Entitlement rides on the user's ID token as the Stripe extension's custom
// claim `stripeRole`. The extension sets it from the purchased product's
// `firebaseRole` metadata once "sync roles to custom claims" is enabled. Keeping
// the claim→boolean mapping here (and only here) means the UI gate and the
// Firestore-rules gate agree by construction.
//
// Fail closed: anything other than an explicit Pro claim is treated as free.

/** The `firebaseRole` / `stripeRole` value that unlocks Pro. Must match the
 *  Stripe product metadata AND the check in firestore.rules. */
export const PRO_ROLE = 'pro';

export interface Entitlement {
  /** True when the user may use cloud sync (an active Pro subscription). */
  pro: boolean;
}

/** The free/default entitlement. */
export const FREE: Entitlement = { pro: false };

/** Derive entitlement from a decoded ID-token claims bag (e.g. the `claims`
 *  field of Firebase's `getIdTokenResult()`). Missing/unknown claim → free. */
export function entitlementFromClaims(
  claims: Record<string, unknown> | null | undefined
): Entitlement {
  return { pro: claims?.stripeRole === PRO_ROLE };
}
