import { expect, test } from '@playwright/test';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture } from '../helpers/env';
import { screenshotProof, signInToHub } from '../helpers/ui';

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

    // When
    await signInToHub(page, user.email, user.password);

    // Then
    await expect(
      page.getByText('Managers').locator('visible=true').first()
    ).toBeVisible();
    await screenshotProof(page, testInfo, 'smoke-hub.png');
  });
});
