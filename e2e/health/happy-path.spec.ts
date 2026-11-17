import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture, frontendUrl } from '../helpers/env';

/**
 * Health Manager happy path (#256).
 *
 * ```
 * Harness -> createEphemeralUser (signup + capture verify)
 * Browser -> /login -> hub
 * Browser -> Health tile -> Health Manager
 * Browser -> create HealthMember (unique name)
 * Browser -> Add reading (notes + unique date) -> history
 * Browser -> Add visit (notes + unique date) -> history
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

async function openHealthManager(page: Page): Promise<void> {
  await visibleLabel(page, 'Health').click();
  await expect(
    page.getByText('Health Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(visibleLabel(page, 'HealthMembers section')).toBeVisible({
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

test.describe('Health Manager happy path', () => {
  test('create member, reading, and doctor visit via UI', async ({
    page,
  }, testInfo) => {
    // Given — capture mail ephemeral user (no Resend)
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const memberName = `E2E Health ${stamp}`;
    const readingDate = utcYmd(0);
    const visitDate = utcYmd(1);
    const readingNotes = `e2e-reading-${stamp}`;
    const visitNotes = `e2e-visit-${stamp}`;

    await signInToHub(page, user.email, user.password);
    await openHealthManager(page);

    // When — create HealthMember
    await visibleLabel(page, 'Create HealthMember').click();
    await visibleLabel(page, 'Create display name').fill(memberName);
    await visibleLabel(page, 'Submit create HealthMember').click();

    // Then — member listed / selectable
    const selectMember = visibleLabel(page, `Select HealthMember ${memberName}`);
    await expect(selectMember).toBeVisible({ timeout: 30_000 });
    await selectMember.click();
    await expect(
      visibleLabel(page, `Selected HealthMember ${memberName}`)
    ).toBeVisible();
    await screenshotProof(page, testInfo, '01-health-member.png');

    // When — add vital reading (notes satisfy "at least one vital or notes")
    await visibleLabel(page, 'Add reading').scrollIntoViewIfNeeded();
    await visibleLabel(page, 'Add reading').click();
    await expect(visibleLabel(page, 'Health reading form')).toBeVisible();
    await visibleLabel(page, 'Recorded date').fill(readingDate);
    await visibleLabel(page, 'Reading notes').fill(readingNotes);
    await visibleLabel(page, 'Save health reading').click();

    // Then — reading in vitals history
    await expect(visibleLabel(page, `Reading on ${readingDate}`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(readingNotes).locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, '02-health-reading.png');

    // When — add doctor visit (date required; notes required by form rules)
    await visibleLabel(page, 'Add visit').scrollIntoViewIfNeeded();
    await visibleLabel(page, 'Add visit').click();
    await expect(visibleLabel(page, 'Doctor visit form')).toBeVisible();
    await visibleLabel(page, 'Visit date').fill(visitDate);
    await visibleLabel(page, 'Visit notes').fill(visitNotes);
    await visibleLabel(page, 'Save visit').click();

    // Then — visit in visit history
    await expect(
      visibleLabel(page, `Doctor visit on ${visitDate}`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(visitNotes).locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, '03-doctor-visit.png');
  });
});
