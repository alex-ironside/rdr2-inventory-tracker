import { expect, type Page } from '@playwright/test';

/** Sign in through the login screen and wait for the playthrough list. Shared by
 *  the emulator specs (cloud-sync, billing). */
export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RDR2 Crafting Tracker' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Your Playthroughs' })).toBeVisible();
}
