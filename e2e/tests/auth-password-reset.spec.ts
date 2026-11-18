import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture, frontendUrl } from '../helpers/env';
import { extractAuthLink, waitForCapturedMail } from '../helpers/mail';

/**
 * Password reset → capture reset link → new password → sign-in.
 * Old password must fail.
 *
 * ```
 * Helper -> ephemeral active user
 * Browser -> /forgot-password
 * Backend -> capture .eml
 * Browser -> /reset-password?token= -> new password
 * Browser -> login new ok; old fails
 * ```
 */
test.describe('auth password reset', () => {
  test('given active user when resetting password then new works and old fails', async ({
    page,
  }, testInfo) => {
    // Given
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const stamp = `${Date.now()}`;
    const newPassword = `E2eNew-${stamp}!`;
    const base = frontendUrl();

    // When — request reset in UI
    await page.goto(`${base}/forgot-password`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email input').fill(user.email);
    await page.getByLabel('Send reset link button').click();
    await expect(
      page
        .getByText(/password reset link|If an account exists/i)
        .locator('visible=true')
        .first()
    ).toBeVisible({ timeout: 60_000 });

    const mail = await waitForCapturedMail({
      to: user.email,
      subjectIncludes: 'Reset',
    });
    const resetUrl = extractAuthLink(mail.body, 'reset-password');
    await page.goto(resetUrl, { waitUntil: 'networkidle' });
    await page.getByLabel('New password input').fill(newPassword);
    await page.getByLabel('Confirm password input').fill(newPassword);
    await page.getByLabel('Set new password button').click();
    await expect(
      page
        .getByText(/Password updated|sign in with your new password/i)
        .locator('visible=true')
        .first()
    ).toBeVisible({ timeout: 60_000 });

    // Then — new password signs in
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username input').fill(user.email);
    await page.getByLabel('Password input').fill(newPassword);
    await page.getByLabel('Sign in button').click();
    const hub = page.locator('[aria-label="Manager hub"]').locator('visible=true');
    await expect(hub.first()).toBeVisible({ timeout: 60_000 });

    // Clear session so old-password attempt is a real login check.
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Username input').fill(user.email);
    await page.getByLabel('Password input').fill(user.password);
    await page.getByLabel('Sign in button').click();
    await expect(
      page.getByText('Invalid username or password').locator('visible=true').first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[aria-label="Manager hub"]').locator('visible=true')
    ).toHaveCount(0);

    const outDir =
      process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
      path.join(testInfo.outputDir, 'proof');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({
      path: path.join(outDir, 'auth-password-reset-old-fails.png'),
      fullPage: true,
    });
  });
});
