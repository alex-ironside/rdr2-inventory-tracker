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

test('the material column stays pinned while the grid scrolls, and the page never scrolls sideways', async ({
  page
}) => {
  await page.getByRole('button', { name: /Continue offline/i }).click();
  await page.getByPlaceholder(/New playthrough title/i).fill('Sticky Panes');
  await page.getByRole('button', { name: /New Playthrough/i }).click();
  await expect(page.getByRole('button', { name: /Inventory Tracker/ })).toBeVisible();

  // Scroll the grid all the way to the right — only the grid's own region may
  // scroll; the material/header column must stay pinned to that region's left
  // edge (the iOS regression made it detach and overlay the data). This guards
  // the removal of `-webkit-overflow-scrolling: touch`, which breaks
  // `position: sticky` inside a scroll container on iOS Safari.
  await page.evaluate(() => {
    const s = document.querySelector('.scroll') as HTMLElement;
    s.scrollLeft = s.scrollWidth;
  });

  const { pinnedDelta } = await page.evaluate(() => {
    const region = document.querySelector('.scroll')!.getBoundingClientRect();
    const rowhead = document.querySelector('th.rowhead')!.getBoundingClientRect();
    return { pinnedDelta: Math.abs(rowhead.left - region.left) };
  });
  // The row header hugs the left edge of the scroll region (a few px of border
  // slack), i.e. `position: sticky` is honoured.
  expect(pinnedDelta).toBeLessThanOrEqual(4);

  // And scrolling the grid never widened the page itself.
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
