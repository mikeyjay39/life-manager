import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Load `.e2e.env` so local `npm run test:e2e` picks generated ports. */
function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(process.env.E2E_ENV_FILE || path.join(__dirname, '..', '.e2e.env'));

const frontendUrl =
  process.env.FRONTEND_URL ||
  (process.env.FRONTEND_PORT
    ? `http://localhost:${process.env.FRONTEND_PORT}`
    : 'http://localhost:8080');
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
  // Manager stories live under e2e/<domain>/; auth/smoke stay under e2e/tests/.
  testDir: '.',
  testMatch: [
    '**/tests/**/*.spec.ts',
    '**/health/**/*.spec.ts',
    '**/documents/**/*.spec.ts',
  ],
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
