import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { frontendUrl } from './env';

/** Expo web mounts hidden duplicates; prefer the visible control. */
export function visibleLabel(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).locator('visible=true').first();
}

/**
 * Sign in through the login UI and wait for the manager hub.
 *
 * Shared by Health, Car, Documents, and smoke e2e scenarios.
 */
export async function signInToHub(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const base = frontendUrl();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await visibleLabel(page, 'Username input').fill(email);
  await visibleLabel(page, 'Password input').fill(password);
  await visibleLabel(page, 'Sign in button').click();
  const hub = page.locator('[aria-label="Manager hub"]').locator('visible=true');
  await expect(hub.first()).toBeVisible({ timeout: 60_000 });
}

/** Alias for Documents-style call sites. */
export const signInAs = signInToHub;

/** UTC calendar day as YYYY-MM-DD (API rejects future dates). */
export function utcYmd(daysAgo = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Write a full-page proof screenshot under PLAYWRIGHT_ARTIFACTS_DIR or
 * `testInfo.outputDir/proof`.
 */
export async function screenshotProof(
  page: Page,
  testInfo: { outputDir: string },
  name: string
): Promise<void> {
  const outDir =
    process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
    path.join(testInfo.outputDir, 'proof');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({
    path: path.join(outDir, name),
    fullPage: true,
  });
}
