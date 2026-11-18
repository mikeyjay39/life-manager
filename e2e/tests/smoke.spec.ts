import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture, frontendUrl } from '../helpers/env';

/**
 * Minimal harness smoke: ephemeral user signs in and reaches the manager hub.
 * Manager domain scenarios are later stories (#255+).
 * Ephemeral user uses signup + capture verify (#259).
 */
test.describe('e2e harness smoke', () => {
  test('given ephemeral user when signing in then hub is visible', async ({
    page,
  }, testInfo) => {
    // Given
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const base = frontendUrl();

    // When
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username input').fill(user.email);
    await page.getByLabel('Password input').fill(user.password);
    await page.getByLabel('Sign in button').click();

    // Then — Expo web mounts hidden duplicates; use :visible locators.
    const hub = page.locator('[aria-label="Manager hub"]').locator('visible=true');
    await expect(hub.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Managers').locator('visible=true').first()).toBeVisible();

    // Keep a success screenshot for local dry runs / manual-test proof.
    const outDir =
      process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
      path.join(testInfo.outputDir, 'proof');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({
      path: path.join(outDir, 'smoke-hub.png'),
      fullPage: true,
    });
  });
});
