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

  // Tracker view (the widest screen — the table scrolls, the page must not).
  await page.getByPlaceholder(/New playthrough title/i).fill('Mobile Run');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test('cell steppers are large enough to tap and work on touch', async ({ page }) => {
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Tap Targets');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  const row = page.locator('tr', { hasText: 'Alligator Skin' }).first();
  const inc = row.getByRole('button', { name: /Increase Alligator Skin — Satchels delivered/ });

  // Finger-sized: at least ~38px in both dimensions (matches the 2.4rem
  // coarse-pointer sizing in CellInput).
  const box = await inc.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(38);
  expect(box!.width).toBeGreaterThanOrEqual(38);

  // And it still functions via a real tap.
  await inc.tap();
  await expect(
    row.getByRole('spinbutton', { name: /Alligator Skin — Satchels delivered/ })
  ).toHaveValue('1');
});
