// Car Manager UI helpers shared by the Car e2e specs.
import { expect, type Page } from '@playwright/test';

import { createEphemeralUser, type EphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture } from '../helpers/env';
import { signInToHub, visibleLabel } from '../helpers/ui';

/** Open Car Manager from the hub and wait for the Cars section. */
export async function openCarManager(page: Page): Promise<void> {
  await visibleLabel(page, 'Cars').click();
  await expect(
    page.getByText('Car Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(visibleLabel(page, 'Cars section')).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Sign in a new capture-mail user (no Resend) through the login UI and open
 * Car Manager.
 */
export async function signInToCarManager(page: Page): Promise<EphemeralUser> {
  assertEmailProviderIsCapture();
  const user = await createEphemeralUser();
  await signInToHub(page, user.email, user.password);
  await openCarManager(page);
  return user;
}

export function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Create a Car with a unique model stamp and select it in the picker. */
export async function createAndSelectCar(
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
