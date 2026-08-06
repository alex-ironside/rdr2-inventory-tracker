import { test, expect } from '@playwright/test';
import {
  seedUsers,
  clearFirestore,
  cloudIterationTitles,
  userExists,
  PRO_USER,
  FREE_USER
} from './support/emulator';
import { signIn } from './support/app';

// End-to-end coverage of the cloud / Pro / sync journey against the real
// Firebase Auth + Firestore emulators and the real firestore.rules. Only runs
// under `npm run e2e:cloud` (which starts the emulators and registers the
// `emulator` Playwright project); the offline/mobile suites never touch it.
//
// Each test gets a fresh browser context (isolated localStorage + IndexedDB),
// fresh seeded users and an empty Firestore, so tests are order-independent.

test.beforeEach(async () => {
  await seedUsers();
  await clearFirestore();
});

test('a Pro user syncs progress to the cloud and it survives a reload', async ({ page }) => {
  await signIn(page, PRO_USER);

  // Signed in as Pro → cloud backend + Pro status shown.
  await expect(page.getByText('☁ Firebase')).toBeVisible();
  await expect(page.getByText('✔ Pro')).toBeVisible();

  // Create a playthrough (a Firestore write through the real rules) and record
  // a delivery on it.
  await page.getByPlaceholder(/New playthrough title/i).fill('Cloud Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  const row = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await row.getByRole('button', { name: /Increase Alligator Skin — Satchels delivered/ }).click();
  await expect(page.getByText('✓ Saved')).toBeVisible();

  // Server-side proof: the document really landed in Firestore under this owner.
  await expect.poll(() => cloudIterationTitles(PRO_USER.uid)).toContain('Cloud Run');

  // Reload — Pro session persists (browserLocalPersistence) and the saved
  // progress reads back from the cloud.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your Playthroughs' })).toBeVisible();
  await page.getByText('Cloud Run').click();
  const reopened = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await expect(
    reopened.getByRole('spinbutton', { name: /Alligator Skin — Satchels delivered/ })
  ).toHaveValue('1');
});

test('offline playthroughs sync up to the cloud after signing in as Pro', async ({ page }) => {
  // 1. Work offline first and build up some progress on this device.
  await page.goto('/');
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Offline Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  const row = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await row.getByRole('button', { name: /Increase Alligator Skin — Satchels delivered/ }).click();
  await expect(page.getByText('✓ Saved')).toBeVisible();

  // 2. Sign out of offline mode (local data stays on the device) and sign in as
  //    Pro — the list surfaces the offline data with a sync offer.
  await page.getByTitle('Back to playthroughs').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, PRO_USER);

  const sync = page.getByRole('region', { name: 'Offline data sync' });
  await expect(sync).toBeVisible();
  await sync.getByRole('button', { name: /Sync 1 to cloud/ }).click();
  await expect(page.getByText(/Synced 1 playthrough to the cloud/)).toBeVisible();

  // 3. It's now in the cloud, server-side.
  await expect.poll(() => cloudIterationTitles(PRO_USER.uid)).toContain('Offline Run');
});

test('a free user stays offline and never writes to the cloud', async ({ page }) => {
  await signIn(page, FREE_USER);

  // Free tier: local backend, upgrade prompt, no cloud pill.
  await expect(page.getByText('Free plan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();
  await expect(page.getByText('📴 Offline')).toBeVisible();

  // Creating a playthrough as a free user writes to localStorage only — the
  // cloud stays empty (the rules would deny a write anyway).
  await page.getByPlaceholder(/New playthrough title/i).fill('Should Stay Local');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  expect(await cloudIterationTitles(FREE_USER.uid)).toEqual([]);
});

test('deleting a Pro account erases the cloud data and the auth user (GDPR)', async ({ page }) => {
  await signIn(page, PRO_USER);
  await page.getByPlaceholder(/New playthrough title/i).fill('Doomed Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();
  await page.getByTitle('Back to playthroughs').click();
  await expect.poll(() => cloudIterationTitles(PRO_USER.uid)).toContain('Doomed Run');

  // Delete the account, confirming with the password.
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel('Confirm password').fill(PRO_USER.password);
  await page.getByRole('button', { name: 'Delete forever' }).click();

  // Back to the login screen, and both the cloud data and the auth user are gone.
  await expect(page.getByRole('heading', { name: 'RDR2 Crafting Tracker' })).toBeVisible();
  expect(await cloudIterationTitles(PRO_USER.uid)).toEqual([]);
  expect(await userExists(PRO_USER.uid)).toBe(false);
});
