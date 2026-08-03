import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production preview build in offline mode (no Firebase
// creds required), so the full user flow is exercised in a real browser.
//
// In CI a post-deployment smoke test can point at the live URL by setting
// E2E_BASE_URL; locally we build + preview.
const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Locally this environment ships a pre-installed Chromium we point at directly.
// On CI we let Playwright manage its own browser (installed via
// `playwright install`), so executablePath is left undefined there.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (process.env.CI ? undefined : '/opt/pw-browsers/chromium');
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions
      }
    },
    {
      // Mobile viewport + touch emulation. Uses a Chromium-based device profile
      // so it runs against the pre-installed Chromium (no WebKit binary needed).
      // On a phone the tracker renders the card view, not the wide grid, so this
      // project runs only the phone-specific spec; the grid-driven journeys
      // (offline-flow, import) are desktop-only and run under `chromium`.
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.ts$/,
      use: {
        ...devices['Pixel 5'],
        launchOptions
      }
    }
  ],
  // Only manage a local server when not targeting a deployed URL.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build:ci && npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
});
