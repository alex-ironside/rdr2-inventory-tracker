import { test, expect } from '@playwright/test';
import { seedUsers, clearFirestore, simulateStripeCheckout, FREE_USER } from './support/emulator';
import { signIn } from './support/app';

// End-to-end coverage of the Stripe billing / upgrade journey against the
// emulators, with the "Run Payments with Stripe" extension simulated test-side
// (see simulateStripeCheckout): the app writes a checkout_sessions doc and we
// respond exactly as the extension + webhook would. Runs under the `emulator`
// project (npm run e2e:cloud).

test.beforeEach(async () => {
  await seedUsers();
  await clearFirestore();
});

test('a free user upgrades through Stripe Checkout and becomes Pro', async ({ page }) => {
  await signIn(page, FREE_USER);
  await expect(page.getByText('Free plan')).toBeVisible();

  // Simulate the extension in the background: it will see the checkout session
  // the click creates, grant the Pro claim, and redirect back with success.
  const extension = simulateStripeCheckout(FREE_USER.uid);
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
  await extension;

  // The app redirected to ?checkout=success, force-refreshed the entitlement and
  // is now Pro with cloud sync on.
  await expect(page.getByText('✔ Pro')).toBeVisible();
  await expect(page.getByText('☁ Firebase')).toBeVisible();
  await expect(page.getByText('Free plan')).toBeHidden();
});

test('a Stripe Checkout error is surfaced to the user', async ({ page }) => {
  await signIn(page, FREE_USER);

  const extension = simulateStripeCheckout(FREE_USER.uid, { error: 'Your card was declined.' });
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
  await extension;

  await expect(page.getByRole('alert')).toHaveText(/Your card was declined\./);
  // Still free — no upgrade happened.
  await expect(page.getByText('Free plan')).toBeVisible();
});
