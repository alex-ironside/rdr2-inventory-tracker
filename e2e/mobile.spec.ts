import { test, expect, devices } from '@playwright/test';

// Mobile-specific regression coverage. The rest of the suite runs under both a
// desktop and a `mobile-chrome` project (see playwright.config.ts); these tests
// pin a phone viewport explicitly and assert the invariants that make the app
// usable on a phone: no horizontal page scroll, and finger-sized tap targets.
test.use({ ...devices['Pixel 5'] });

// The document (the page itself) must never scroll sideways — only the tracker
// grid does, inside its own scroll region.
async function expectNoHorizontalPageScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  // Allow a 1px rounding slack.
  expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

/** Create a fresh offline playthrough and land on the tracker. */
async function openTracker(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill(title);
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  // On a phone the tracker opens in the card view (no sideways-scrolling grid).
  await expect(page.getByLabel('Search Inventory Tracker')).toBeVisible();
}

test('the whole offline journey fits the phone viewport without sideways scroll', async ({
  page
}) => {
  // Login screen.
  await expect(page.getByRole('heading', { name: 'RDR2 Crafting Tracker' })).toBeVisible();
  await expectNoHorizontalPageScroll(page);

  // Playthrough list.
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await expect(page.getByRole('heading', { name: 'Your Playthroughs' })).toBeVisible();
  await expectNoHorizontalPageScroll(page);

  // Tracker view. On a phone this is the card list, not the wide grid, so there
  // is nothing to scroll sideways in the first place.
  await page.getByPlaceholder(/New playthrough title/i).fill('Mobile Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByLabel('Search Inventory Tracker')).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test('the phone shows the searchable card list instead of the grid', async ({ page }) => {
  await openTracker(page, 'Card View');

  // The wide grid (and its horizontally-scrolling region) is not rendered on a
  // phone — that whole class of sideways-scroll / sticky-pane problem is gone.
  await expect(page.locator('.scroll')).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);

  // Search narrows the list to a single material.
  await page.getByLabel('Search Inventory Tracker').fill('Alligator');
  await expect(page.getByText('Alligator Skin')).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test('switching sheets uses the bottom-sheet picker, not a horizontal tab strip', async ({
  page
}) => {
  await openTracker(page, 'Sheet Switch');

  // Open the picker from the current-sheet button and jump to another sheet.
  await page.getByRole('button', { name: /Sheet Inventory Tracker/ }).click();
  const picker = page.getByRole('dialog', { name: 'Jump to a sheet' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: /Camp Improvements/ }).click();

  await expect(page.getByLabel('Search Camp Improvements')).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test('card steppers are large enough to tap and work on touch', async ({ page }) => {
  await openTracker(page, 'Tap Targets');

  await page.getByLabel('Search Inventory Tracker').fill('Alligator');
  const card = page.locator('.mat-card', { hasText: 'Alligator Skin' });
  // Tap the card to expand its per-use steppers.
  await card.getByText('Alligator Skin').tap();

  const inc = card.getByRole('button', { name: /Increase Alligator Skin — Satchels delivered/ });

  // Finger-sized: at least ~38px in both dimensions (matches the 2.4rem
  // coarse-pointer sizing in CellInput).
  const box = await inc.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(38);
  expect(box!.width).toBeGreaterThanOrEqual(38);

  // And it still functions via a real tap.
  await inc.tap();
  await expect(
    card.getByRole('spinbutton', { name: /Alligator Skin — Satchels delivered/ })
  ).toHaveValue('1');
});
