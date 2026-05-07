import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test config for the OpenA2M operator console.
 *
 * Assumes:
 *   - Console dev server running at http://localhost:3000 (or PORT env)
 *   - Gateway running at http://localhost:8080 (or AIMP_GATEWAY_URL env)
 *   - `make seed` has been run (devices + policies registered)
 *
 * Run:
 *   npx playwright test            # headless
 *   npx playwright test --headed   # headed
 *   npx playwright test --ui       # interactive UI mode
 */

const CONSOLE_URL = process.env.CONSOLE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,   // serial — tests share gateway state
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,        // 60 s per test (jobs can take ~30 s end-to-end)
  expect: { timeout: 10_000 },

  use: {
    baseURL: CONSOLE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Use live mode — E2E tests need a real gateway
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer block — tests expect the console and gateway to already be running.
  // Use `make dev-up && make seed` before running E2E tests.
  //
  // To auto-start the console dev server uncomment:
  // webServer: {
  //   command: 'npm run dev',
  //   url: CONSOLE_URL,
  //   reuseExistingServer: true,
  //   timeout: 30_000,
  // },
})
