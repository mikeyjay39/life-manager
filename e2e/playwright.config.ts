import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
const artifactDir =
  process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
  path.join(__dirname, 'test-results');

/**
 * Playwright harness for CI / local docker-dev e2e.
 *
 * ```
 * CI -> up.sh -> wait-ready -> playwright test
 * alt fail
 *   playwright -> full-page screenshot -> upload-artifact
 * end
 * ```
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: artifactDir,
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
