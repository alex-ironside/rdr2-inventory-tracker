import { describe, it, expect, vi, beforeEach } from 'vitest';

// Inspectable fakes for the Firestore + Functions SDKs.
const h = vi.hoisted(() => ({
  addDoc: vi.fn(),
  onSnapshotCb: null as ((snap: { data: () => unknown }) => void) | null,
  unsub: vi.fn(),
  getFunctions: vi.fn(() => ({ __fns: true })),
  portalCallable: vi.fn(async () => ({ data: { url: 'https://portal.example' } })),
  httpsCallable: vi.fn()
}));

vi.mock('../src/lib/firebase', () => ({
  getDb: () => ({ __db: true }),
  getFirebaseApp: () => ({ __app: true })
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ __col: args }),
  addDoc: h.addDoc,
  onSnapshot: (_ref: unknown, cb: (snap: { data: () => unknown }) => void) => {
    h.onSnapshotCb = cb;
    return h.unsub;
  }
}));

vi.mock('firebase/functions', () => ({
  getFunctions: h.getFunctions,
  httpsCallable: h.httpsCallable
}));

import { FirebaseBillingBackend } from '../src/lib/billing';

const flush = () => new Promise((r) => setTimeout(r));

beforeEach(() => {
  vi.clearAllMocks();
  h.onSnapshotCb = null;
  h.addDoc.mockResolvedValue({ __ref: true });
  h.httpsCallable.mockReturnValue(h.portalCallable);
  h.portalCallable.mockResolvedValue({ data: { url: 'https://portal.example' } });
});

describe('FirebaseBillingBackend.startCheckout', () => {
  const req = {
    priceId: 'price_123',
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel'
  };

  it('writes a checkout session and resolves the hosted url', async () => {
    const backend = new FirebaseBillingBackend('user-1');
    const p = backend.startCheckout(req);
    await flush();

    // Session doc written with the Stripe price + redirect urls (no mode by default).
    const payload = h.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      price: 'price_123',
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel'
    });

    // A not-yet-populated snapshot is ignored; the populated one resolves.
    h.onSnapshotCb!({ data: () => undefined });
    h.onSnapshotCb!({ data: () => ({ url: 'https://checkout.stripe' }) });

    await expect(p).resolves.toBe('https://checkout.stripe');
    expect(h.unsub).toHaveBeenCalledOnce();
  });

  it('passes a one-time payment mode when requested', async () => {
    const backend = new FirebaseBillingBackend('user-1');
    void backend.startCheckout({ ...req, mode: 'payment' });
    await flush();
    const payload = h.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.mode).toBe('payment');
  });

  it('rejects with the extension error message', async () => {
    const backend = new FirebaseBillingBackend('user-1');
    const p = backend.startCheckout(req);
    await flush();
    h.onSnapshotCb!({ data: () => ({ error: { message: 'card declined' } }) });
    await expect(p).rejects.toThrow('card declined');
    expect(h.unsub).toHaveBeenCalledOnce();
  });

  it('falls back to a generic message when the error has none', async () => {
    const backend = new FirebaseBillingBackend('user-1');
    const p = backend.startCheckout(req);
    await flush();
    h.onSnapshotCb!({ data: () => ({ error: {} }) });
    await expect(p).rejects.toThrow(/could not be started/i);
  });

  it('propagates a failure to create the session doc', async () => {
    h.addDoc.mockRejectedValueOnce(new Error('permission-denied'));
    const backend = new FirebaseBillingBackend('user-1');
    await expect(backend.startCheckout(req)).rejects.toThrow('permission-denied');
  });
});

describe('FirebaseBillingBackend.openBillingPortal', () => {
  it('calls the extension portal function and returns its url', async () => {
    const backend = new FirebaseBillingBackend('user-1');
    const url = await backend.openBillingPortal('https://app/account');

    expect(h.httpsCallable).toHaveBeenCalledWith(
      { __fns: true },
      'ext-firestore-stripe-payments-createPortalLink'
    );
    expect(h.portalCallable).toHaveBeenCalledWith({ returnUrl: 'https://app/account' });
    expect(url).toBe('https://portal.example');
  });
});
