import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { assertEmailProviderIsCapture, frontendUrl } from '../helpers/env';
import { extractAuthLink, waitForCapturedMail } from '../helpers/mail';

/**
 * Signup → capture verify link → verify UI → sign-in.
 *
 * ```
 * Browser -> /signup -> POST signup
 * Backend -> capture .eml
 * Harness -> open /verify-email?token=
 * Browser -> /login -> hub
 * ```
 */
test.describe('auth signup and verify', () => {
  test('given signup when opening captured verify link then sign-in reaches hub', async ({
    page,
  }, testInfo) => {
    // Given
    assertEmailProviderIsCapture();
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const email = `e2e-signup-${stamp}@example.com`;
    const password = `E2ePass-${stamp}!`;
    const base = frontendUrl();

    // When — signup UI
    await page.goto(`${base}/signup`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email input').fill(email);
    await page.getByLabel('Password input').fill(password);
    await page.getByLabel('Confirm password input').fill(password);
    await page.getByLabel('Create account button').click();
    await expect(
      page.getByText('Check your email').locator('visible=true').first()
    ).toBeVisible({ timeout: 60_000 });

    const mail = await waitForCapturedMail({
      to: email,
      subjectIncludes: 'Verify',
    });
    const verifyUrl = extractAuthLink(mail.body, 'verify-email');
    await page.goto(verifyUrl, { waitUntil: 'networkidle' });
    // Require success copy — "Go to sign in" also appears on verify errors.
    await expect(
      page.getByText(/Email verified/i).locator('visible=true').first()
    ).toBeVisible({ timeout: 60_000 });

    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username input').fill(email);
    await page.getByLabel('Password input').fill(password);
    await page.getByLabel('Sign in button').click();

    // Then
    const hub = page.locator('[aria-label="Manager hub"]').locator('visible=true');
    await expect(hub.first()).toBeVisible({ timeout: 60_000 });

    const outDir =
      process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
      path.join(testInfo.outputDir, 'proof');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({
      path: path.join(outDir, 'auth-signup-verify-hub.png'),
      fullPage: true,
    });
  });
});
