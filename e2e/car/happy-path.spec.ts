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
 * Car Manager happy path (#257).
 *
 * ```
 * Harness -> createEphemeralUser (signup + capture verify)
 * Browser -> /login -> hub
 * Browser -> Cars tile -> Car Manager
 * Browser -> Create Car (make/model/year) -> picker
 * Browser -> Add maintenance event (type + title) -> history
 * Browser -> Edit Car fields -> Save Car -> updated label
 * Browser -> Deactivate Car -> leaves active picker (inactive when included)
 * Browser -> Delete Car -> removed from UI
 * ```
 */

async function openCarManager(page: Page): Promise<void> {
  await visibleLabel(page, 'Cars').click();
  await expect(
    page.getByText('Car Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(visibleLabel(page, 'Cars section')).toBeVisible({
    timeout: 30_000,
  });
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Create a Car with a unique model stamp and select it in the picker. */
async function createAndSelectCar(
  page: Page,
  opts?: { make?: string; year?: string; modelPrefix?: string }
): Promise<{ make: string; model: string; year: string; carLabel: string }> {
  const stamp = uniqueStamp();
  const make = opts?.make ?? 'Toyota';
  const year = opts?.year ?? '2018';
  const model = `${opts?.modelPrefix ?? 'E2E'}-${stamp}`;
  const carLabel = `${year} ${make} ${model}`;

  await visibleLabel(page, 'Create Car').click();
  await visibleLabel(page, 'Create make').fill(make);
  await visibleLabel(page, 'Create model').fill(model);
  await visibleLabel(page, 'Create year').fill(year);
  await visibleLabel(page, 'Submit create Car').click();

  const selectCar = visibleLabel(page, `Select Car ${carLabel}`);
  await expect(selectCar).toBeVisible({ timeout: 30_000 });
  await selectCar.click();
  await expect(
    page.getByText(carLabel).locator('visible=true').first()
  ).toBeVisible();

  return { make, model, year, carLabel };
}

test.describe('Car Manager happy path', () => {
  test('create Car and maintenance event via UI', async ({ page }, testInfo) => {
    // Given — capture mail ephemeral user (no Resend)
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const stamp = uniqueStamp();
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

  test('edit Car fields via UI', async ({ page }, testInfo) => {
    // Given — capture mail ephemeral user and a selected Car
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();
    const stamp = uniqueStamp();
    const editedModel = `E2E-edited-${stamp}`;
    const editedYear = '2020';

    await signInToHub(page, user.email, user.password);
    await openCarManager(page);
    const { make, carLabel: originalLabel } = await createAndSelectCar(page, {
      modelPrefix: 'E2E-edit',
    });
    const updatedLabel = `${editedYear} ${make} ${editedModel}`;

    // When — edit make/model/year style fields and save
    await visibleLabel(page, 'Edit Car').click();
    await expect(visibleLabel(page, 'Edit make')).toBeVisible({
      timeout: 15_000,
    });
    await visibleLabel(page, 'Edit model').fill(editedModel);
    await visibleLabel(page, 'Edit year').fill(editedYear);
    await visibleLabel(page, 'Save Car').click();

    // Then — UI shows the updated Car label
    const selectUpdated = visibleLabel(page, `Select Car ${updatedLabel}`);
    await expect(selectUpdated).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByText(`${make} ${editedModel} (${editedYear})`)
        .locator('visible=true')
        .first()
    ).toBeVisible();
    await expect(
      page.getByLabel(`Select Car ${originalLabel}`, { exact: true })
    ).toHaveCount(0);
    await screenshotProof(page, testInfo, '03-car-edited.png');
  });

  test('deactivate Car via UI', async ({ page }, testInfo) => {
    // Given — capture mail ephemeral user and a selected Car
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();

    await signInToHub(page, user.email, user.password);
    await openCarManager(page);
    const { carLabel } = await createAndSelectCar(page, {
      modelPrefix: 'E2E-deact',
    });

    // When — confirm deactivate dialog
    await visibleLabel(page, 'Deactivate Car').click();
    await expect(
      page.getByText('Deactivate Car?').locator('visible=true').first()
    ).toBeVisible({ timeout: 15_000 });
    await visibleLabel(page, 'Deactivate').click();

    // Then — Car leaves the default active picker
    await expect(
      page.getByLabel(`Select Car ${carLabel}`, { exact: true })
    ).toHaveCount(0, { timeout: 30_000 });

    // And — with include-inactive, UI shows inactive Car / status
    await visibleLabel(page, 'Include inactive Cars').click();
    const selectInactive = visibleLabel(
      page,
      `Select inactive Car ${carLabel}`
    );
    await expect(selectInactive).toBeVisible({ timeout: 30_000 });
    await selectInactive.click();
    await expect(
      page.getByText('Inactive').locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, '04-car-deactivated.png');
  });

  test('delete Car via UI', async ({ page }, testInfo) => {
    // Given — capture mail ephemeral user and a selected Car
    assertEmailProviderIsCapture();
    const user = await createEphemeralUser();

    await signInToHub(page, user.email, user.password);
    await openCarManager(page);
    const { carLabel } = await createAndSelectCar(page, {
      modelPrefix: 'E2E-del',
    });

    // When — confirm delete dialog
    await visibleLabel(page, 'Delete Car').click();
    await expect(
      page.getByText('Delete Car?').locator('visible=true').first()
    ).toBeVisible({ timeout: 15_000 });
    await visibleLabel(page, 'Delete').click();

    // Then — Car is removed from the UI
    await expect(
      page.getByLabel(`Select Car ${carLabel}`, { exact: true })
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(
      page.getByText(carLabel).locator('visible=true')
    ).toHaveCount(0);
    await screenshotProof(page, testInfo, '05-car-deleted.png');
  });
});
