import { test, expect } from '@playwright/test';

// End-to-end coverage of the primary user journey in offline mode (no Firebase
// account needed). Exercises the real app, real localStorage persistence and a
// real browser reload.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('a new visitor can work entirely offline', async ({ page }) => {
  // 1. Lands on the login screen and chooses offline mode.
  await expect(page.getByRole('heading', { name: 'RDR2 Crafting Tracker' })).toBeVisible();
  await page.getByRole('button', { name: /Continue offline/i }).click();

  // 2. Sees the (empty) playthrough list.
  await expect(page.getByRole('heading', { name: 'Your Playthroughs' })).toBeVisible();
  await expect(page.getByText('No playthroughs yet')).toBeVisible();

  // 3. Creates a playthrough and lands in the tracker.
  await page.getByPlaceholder(/New playthrough title/i).fill('Honor Arthur Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();
  await expect(page.getByText('Honor Arthur Run')).toBeVisible();

  // 4. Records some delivered pelts on the first material.
  const row = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await row.getByRole('button', { name: /Increase Alligator Skin — Satchels delivered/ }).click();
  await expect(page.getByText('✓ Saved')).toBeVisible();

  // 5. Reloads the browser — offline mode is remembered and data persists, so
  //    the app returns straight to the playthrough list.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your Playthroughs' })).toBeVisible();
  await page.getByText('Honor Arthur Run').click();
  const reopenedRow = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await expect(
    reopenedRow.getByRole('spinbutton', { name: /Alligator Skin — Satchels delivered/ })
  ).toHaveValue('1');
});

test('columns and rows can be frozen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Freeze Test');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  const freezeCol = page.getByRole('button', { name: 'Freeze column Satchels' });
  await freezeCol.click();
  // The pin flips to the pressed state and offers to unfreeze.
  await expect(page.getByRole('button', { name: 'Unfreeze column Satchels' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  const freezeRow = page.getByRole('button', { name: /Freeze row Alligator Skin/ });
  await freezeRow.click();
  await expect(page.getByRole('button', { name: /Unfreeze row Alligator Skin/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('iterations can be renamed and deleted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Continue offline/i }).click();

  await page.getByPlaceholder(/New playthrough title/i).fill('First Draft');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  // Rename in the tracker header.
  await page.getByTitle('Rename').click();
  const input = page.locator('input.title-edit');
  await expect(input).toHaveValue('First Draft');
  await input.fill('Final Cut');
  await input.press('Enter');
  await expect(page.getByText('Final Cut')).toBeVisible();

  // Back to the list, then delete it.
  await page.getByTitle('Back to playthroughs').click();
  await expect(page.getByText('Final Cut')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete playthrough' }).click();
  await expect(page.getByText('No playthroughs yet')).toBeVisible();
});

test('bulk check a row, then undo it from history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Check + History');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  const row = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  const camp = row.getByRole('spinbutton', { name: /Alligator Skin — Camp delivered/ });
  await expect(camp).toHaveValue('0');

  // Check the whole row (confirm the dialog) → collected becomes required.
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: /Check all collected in row Alligator Skin/ }).click();
  await expect(camp).toHaveValue('1');

  // The action was recorded; undo it by restoring the checkpoint.
  await page.getByRole('button', { name: /History \(1\)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Change history' });
  await expect(dialog).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(camp).toHaveValue('0');
});

test('switching sheet tabs shows the right columns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Tabs');
  await page.getByRole('button', { name: /New Playthrough/i }).click();

  await page.getByRole('button', { name: /Reinforced Equipment/ }).click();
  // Reinforced Equipment has a "Done?" boolean column.
  await expect(page.getByRole('columnheader', { name: /Done\?/ })).toBeVisible();
  const banditRow = page.locator('tr', { hasText: 'Bandit' }).first();
  await banditRow.getByRole('checkbox').check();
  await expect(banditRow.getByRole('checkbox')).toBeChecked();
});
