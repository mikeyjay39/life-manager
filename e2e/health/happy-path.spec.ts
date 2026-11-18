import { expect, test, type Page } from '@playwright/test';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture } from '../helpers/env';
import {
  screenshotProof,
  signInToHub,
  utcYmd,
  visibleLabel,
} from '../helpers/ui';

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

async function openHealthManager(page: Page): Promise<void> {
  await visibleLabel(page, 'Health').click();
  await expect(
    page.getByText('Health Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(visibleLabel(page, 'HealthMembers section')).toBeVisible({
    timeout: 30_000,
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
