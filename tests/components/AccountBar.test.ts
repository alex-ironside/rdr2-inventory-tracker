import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AccountBar from '../../src/components/AccountBar.svelte';
import { session } from '../../src/lib/session.svelte';
import type { User } from 'firebase/auth';

// Fake billing backend; capture instances so tests can assert calls.
const startCheckout = vi.fn(async () => 'https://checkout.stripe/session');
const openBillingPortal = vi.fn(async () => 'https://portal.stripe/link');
vi.mock('../../src/lib/billing', () => ({
  FirebaseBillingBackend: class {
    constructor(public uid: string) {}
    startCheckout = startCheckout;
    openBillingPortal = openBillingPortal;
  }
}));

const realLocation = window.location;
let assignSpy: ReturnType<typeof vi.fn>;

/** Swap window.location for a fake so navigation is inspectable (jsdom's real
 *  location.assign is a no-op that can't be spied). */
function mockLocation(props: Record<string, unknown>) {
  Object.defineProperty(window, 'location', {
    value: { ...realLocation, assign: assignSpy, ...props },
    writable: true,
    configurable: true
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_STRIPE_PRICE_ID', 'price_pro');
  session.user = { uid: 'u1', email: 'me@example.com' } as unknown as User;
  session.pro = false;
  session.authError = null;
  assignSpy = vi.fn();
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs();
  // Restore jsdom's real location.
  Object.defineProperty(window, 'location', {
    value: realLocation,
    writable: true,
    configurable: true
  });
  session.user = null;
  session.pro = false;
});

describe('AccountBar', () => {
  it('renders nothing for an offline (not signed-in) session', () => {
    session.user = null;
    const { container } = render(AccountBar);
    expect(container.querySelector('.account-bar')).toBeNull();
  });

  it('shows the free plan with an upgrade CTA and starts checkout', async () => {
    mockLocation({ origin: 'https://app', pathname: '/app/', href: 'https://app/app/' });
    render(AccountBar);
    expect(screen.getByText(/Free plan/i)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));

    await waitFor(() =>
      expect(startCheckout).toHaveBeenCalledWith({
        priceId: 'price_pro',
        successUrl: 'https://app/app/?checkout=success',
        cancelUrl: 'https://app/app/'
      })
    );
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://checkout.stripe/session')
    );
  });

  it('warns when no Stripe price is configured', async () => {
    vi.stubEnv('VITE_STRIPE_PRICE_ID', '');
    render(AccountBar);
    await fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('surfaces a checkout error', async () => {
    startCheckout.mockRejectedValueOnce(new Error('card declined'));
    render(AccountBar);
    await fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('card declined');
  });

  it('shows Pro status and opens the billing portal', async () => {
    session.pro = true;
    mockLocation({ href: 'https://app/app/' });
    render(AccountBar);
    expect(screen.getByText(/Cloud sync is on/i)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() =>
      expect(openBillingPortal).toHaveBeenCalledWith('https://app/app/')
    );
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://portal.stripe/link'));
  });

  it('surfaces a billing-portal error', async () => {
    session.pro = true;
    openBillingPortal.mockRejectedValueOnce(new Error('portal down'));
    render(AccountBar);
    await fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('portal down');
  });

  it('confirms and performs account deletion with a password', async () => {
    const del = vi.spyOn(session, 'deleteAccount').mockResolvedValue(true);
    render(AccountBar);

    await fireEvent.click(screen.getByRole('button', { name: /Delete account/i }));
    await fireEvent.input(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'secret1' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /Delete forever/i }));

    expect(del).toHaveBeenCalledWith('secret1');
    // Dialog closes on success.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Delete forever/i })).not.toBeInTheDocument()
    );
  });

  it('keeps the dialog open and shows the error when deletion fails', async () => {
    vi.spyOn(session, 'deleteAccount').mockImplementation(async () => {
      session.authError = 'Please re-enter your password to confirm this change.';
      return false;
    });
    render(AccountBar);
    await fireEvent.click(screen.getByRole('button', { name: /Delete account/i }));
    await fireEvent.input(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'wrong' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /Delete forever/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/re-enter your password/i);
    expect(screen.getByRole('button', { name: /Delete forever/i })).toBeInTheDocument();
  });

  it('can cancel the delete confirmation', async () => {
    render(AccountBar);
    await fireEvent.click(screen.getByRole('button', { name: /Delete account/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('button', { name: /Delete forever/i })).not.toBeInTheDocument();
  });

  it('refreshes entitlement when returning from a successful checkout', async () => {
    const refresh = vi.spyOn(session, 'refreshEntitlement').mockResolvedValue();
    // Use jsdom's real (same-origin) location so replaceState is allowed.
    window.history.replaceState({}, '', '/app/?checkout=success');
    render(AccountBar);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // The marker is cleaned out of the URL.
    expect(window.location.search).not.toContain('checkout');
  });
});
