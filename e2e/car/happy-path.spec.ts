import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture, frontendUrl } from '../helpers/env';

/**
 * Car Manager happy path (#257).
 *
 * ```
 * Harness -> createEphemeralUser (signup + capture verify)
 * Browser -> /login -> hub
 * Browser -> Cars tile -> Car Manager
 * Browser -> Create Car (make/model/year) -> picker
 * Browser -> Add maintenance event (type + title) -> history
 * ```
 */

/** Expo web mounts hidden duplicates; prefer the visible control. */
function visibleLabel(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).locator('visible=true').first();
}

/** UTC calendar day as YYYY-MM-DD (API rejects future dates). */
function utcYmd(daysAgo = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function signInToHub(page: Page, email: string, password: string): Promise<void> {
  const base = frontendUrl();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await visibleLabel(page, 'Username input').fill(email);
  await visibleLabel(page, 'Password input').fill(password);
  await visibleLabel(page, 'Sign in button').click();
  const hub = page.locator('[aria-label="Manager hub"]').locator('visible=true');
  await expect(hub.first()).toBeVisible({ timeout: 60_000 });
}

async function openCarManager(page: Page): Promise<void> {
  await visibleLabel(page, 'Cars').click();
  await expect(
    page.getByText('Car Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(visibleLabel(page, 'Cars section')).toBeVisible({
    timeout: 30_000,
  });
}

async function screenshotProof(
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

test.describe('Car Manager happy path', () => {
  test('create Car and maintenance event via UI', async ({ page }, testInfo) => {
    // Given — capture mail ephemeral user (no Resend)
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const make = 'Toyota';
    const model = `E2E-${stamp}`;
    const year = '2018';
    const carLabel = `${year} ${make} ${model}`;
    const eventDate = utcYmd(0);
    const eventTitle = `e2e-oil-${stamp}`;

    await signInToHub(page, user.email, user.password);
    await openCarManager(page);

    // When — create Car (make/model/year; leave VIN/plate empty)
    await visibleLabel(page, 'Create Car').click();
    await visibleLabel(page, 'Create make').fill(make);
    await visibleLabel(page, 'Create model').fill(model);
    await visibleLabel(page, 'Create year').fill(year);
    await visibleLabel(page, 'Submit create Car').click();

    // Then — Car listed / selectable
    const selectCar = visibleLabel(page, `Select Car ${carLabel}`);
    await expect(selectCar).toBeVisible({ timeout: 30_000 });
    await selectCar.click();
    await expect(
      page.getByText(carLabel).locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, '01-car-created.png');

    // When — add maintenance event (default oil_change + title detail)
    await visibleLabel(page, 'Add maintenance event').scrollIntoViewIfNeeded();
    await visibleLabel(page, 'Add maintenance event').click();
    await expect(visibleLabel(page, 'Maintenance event form')).toBeVisible();
    await visibleLabel(page, 'Maintenance event date').fill(eventDate);
    await visibleLabel(page, 'Select event type Oil change').click();
    await visibleLabel(page, 'Maintenance title').fill(eventTitle);
    // Leave insurance/registration/receipt document pickers unset.
    await visibleLabel(page, 'Save maintenance event').click();

    // Then — event in maintenance history
    await expect(
      visibleLabel(page, `Maintenance event Oil change on ${eventDate}`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(eventTitle).locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, '02-maintenance-event.png');
  });
});
