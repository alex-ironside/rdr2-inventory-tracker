// Stripe billing — the impure shell over the "Run Payments with Stripe" Firebase
// extension. The extension owns the Stripe secret key and webhooks server-side;
// the client never sees a secret. Two operations:
//
//   * startCheckout — write a doc under customers/{uid}/checkout_sessions; the
//     extension's Function fills in a hosted Checkout `url` (or an `error`),
//     which we watch for and return so the caller can redirect the browser.
//   * openBillingPortal — call the extension's callable to get a Stripe billing
//     portal URL (manage / cancel a subscription).
//
// Entitlement (is-this-user-Pro) is NOT here — it rides on the ID-token claim
// and is derived in entitlement.ts / applied in session.svelte.ts.
//
// Depends on the interface, not the concrete class (DIP), so the UI is testable
// with an in-memory fake — mirroring StorageBackend.

import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { getDb, getFirebaseApp } from './firebase';

// The extension's instance id (default) and deploy region determine the
// callable name + Functions region. Change here if the extension is installed
// under a different instance id / region.
const EXT_INSTANCE = 'firestore-stripe-payments';
const FUNCTIONS_REGION = 'us-central1';

export interface CheckoutRequest {
  /** Stripe Price id (from the Pro product). */
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** 'payment' for a one-time Pro unlock; omit for a recurring subscription
   *  (the extension infers subscription mode from a recurring price). */
  mode?: 'subscription' | 'payment';
}

export interface BillingBackend {
  /** Start Stripe Checkout; resolves to the hosted checkout URL to redirect to,
   *  or rejects with a user-friendly error. */
  startCheckout(req: CheckoutRequest): Promise<string>;
  /** Resolve the Stripe billing-portal URL for managing/cancelling. */
  openBillingPortal(returnUrl: string): Promise<string>;
}

export class FirebaseBillingBackend implements BillingBackend {
  constructor(private readonly uid: string) {}

  async startCheckout(req: CheckoutRequest): Promise<string> {
    const sessions = collection(getDb(), 'customers', this.uid, 'checkout_sessions');
    const payload: Record<string, unknown> = {
      price: req.priceId,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl
    };
    if (req.mode) payload.mode = req.mode;

    const ref = await addDoc(sessions, payload);

    // The extension writes back asynchronously; watch the same doc for the URL.
    return new Promise<string>((resolve, reject) => {
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data() as
          | { url?: string; error?: { message?: string } }
          | undefined;
        if (!data) return; // not populated yet
        if (data.error) {
          unsub();
          reject(new Error(data.error.message ?? 'Checkout could not be started.'));
        } else if (data.url) {
          unsub();
          resolve(data.url);
        }
      });
    });
  }

  async openBillingPortal(returnUrl: string): Promise<string> {
    // firebase/functions is lazily imported so it stays out of the initial
    // bundle (only needed when a Pro user manages billing).
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fns = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
    const createPortalLink = httpsCallable<{ returnUrl: string }, { url: string }>(
      fns,
      `ext-${EXT_INSTANCE}-createPortalLink`
    );
    const res = await createPortalLink({ returnUrl });
    return res.data.url;
  }
}
