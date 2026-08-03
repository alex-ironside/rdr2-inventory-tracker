import { test, expect } from '@playwright/test';
import * as XLSX from '@e965/xlsx';

// End-to-end: uploading a crafting spreadsheet imports the collected ("You
// Have") amounts into the open playthrough, non-destructively. Runs in both the
// desktop and mobile Chromium projects.

function buildWorkbook(): Buffer {
  const rows = [
    [
      'Material',
      'Biome / Location',
      'You Have',
      'Satchels',
      'Camp',
      'Trapper Clothes',
      'Trapper Saddles'
    ],
    ['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1],
    ['Deer Pelt', 'Forests', 7, 7, 0, 5, 0]
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Inventory Tracker');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('imports collected amounts from a spreadsheet and can be undone', async ({ page }) => {
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Import E2E');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  await page.setInputFiles('input[type="file"]', {
    name: 'RDR2_Crafting_Tracker.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buildWorkbook()
  });

  // Confirmation summary appears. The 8 collected pelts also flow into the
  // crafting recipe tabs, so more than the 2 inventory rows are updated.
  await expect(page.getByRole('status')).toContainText(/Imported \d+ items\s+\(8 collected\)/);

  // Alligator's Camp (required 1) is now filled from the "You Have" of 1.
  const alligator = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  await expect(
    alligator.getByRole('spinbutton', { name: /Alligator Skin — Camp delivered/ })
  ).toHaveValue('1');

  // Deer's 7 collected fill the Satchels requirement (7).
  const deer = page.locator('tr', { hasText: 'Deer Pelt' }).first();
  await expect(
    deer.getByRole('spinbutton', { name: /Deer Pelt — Satchels delivered/ })
  ).toHaveValue('7');

  // The import recorded an undoable checkpoint; restoring reverts it.
  await page.getByRole('button', { name: /History \(1\)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Change history' });
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(
    alligator.getByRole('spinbutton', { name: /Alligator Skin — Camp delivered/ })
  ).toHaveValue('0');

  // The green confirmation is a transient toast — it dismisses itself, never
  // lingering over the header.
  await expect(page.getByRole('status')).toBeHidden({ timeout: 10_000 });
});

test('import populates the dedicated Satchels tab from collected pelts', async ({ page }) => {
  // Regression for the reported bug: collecting the pelts a satchel needs must
  // advance the Satchels tab, not only the Inventory Tracker's Satchels column.
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Satchels Import E2E');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  await page.setInputFiles('input[type="file"]', {
    name: 'RDR2_Crafting_Tracker.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buildWorkbook()
  });
  await expect(page.getByRole('status')).toContainText(/Imported \d+ items/);

  // Deer Pelt is the first ingredient of every Pearson satchel; the 7 collected
  // fill each satchel's Deer requirement. Open the Satchels tab and check one.
  await page.locator('nav.tabs').getByRole('button', { name: /Satchels/ }).click();
  const tonics = page.locator('tr', { hasText: 'Tonics Satchel' }).first();
  await expect(
    tonics.getByRole('spinbutton', { name: /Tonics Satchel — Qty delivered/ }).first()
  ).toHaveValue('1');
});
