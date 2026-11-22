import { expect, test } from '@playwright/test';

import { createEphemeralUser } from '../helpers/auth';
import { assertEmailProviderIsCapture } from '../helpers/env';
import { screenshotProof, signInAs } from '../helpers/ui';
import { loginForApi, seedOwnedDocument } from './seed';
import { attachNoResendNoProtonGuard, openDocumentManager } from './ui';

/**
 * Documents (Life) Manager happy path (#255).
 *
 * ```
 * Harness -> createEphemeralUser (signup + capture verify)
 * Browser -> /login -> hub -> Documents
 * alt edit scenario
 *   Harness -> API multipart seed (no Proton)
 *   Browser -> open row -> Edit -> Save title
 * end
 * ```
 */
test.describe('Documents Manager happy path', () => {
  test('given ephemeral user when opening Documents then Document Manager is visible', async ({
    page,
  }, testInfo) => {
    // Given
    assertEmailProviderIsCapture();
    const detach = attachNoResendNoProtonGuard(page);
    const user = await createEphemeralUser();

    try {
      // When
      await signInAs(page, user.email, user.password);
      await openDocumentManager(page);

      // Then
      await expect(
        page
          .locator('[aria-label="Create document section"]')
          .locator('visible=true')
          .first()
      ).toBeVisible();
      await expect(
        page
          .locator('[aria-label="Proton setup section"]')
          .locator('visible=true')
          .first()
      ).toBeVisible();

      await screenshotProof(page, testInfo, 'documents-manager-open.png');
    } finally {
      detach();
    }
  });

  test('given API-seeded document when editing title then updated title is visible', async ({
    page,
  }, testInfo) => {
    // Given
    assertEmailProviderIsCapture();
    const detach = attachNoResendNoProtonGuard(page);
    const user = await createEphemeralUser();
    const token = await loginForApi(user.email, user.password);
    const seeded = await seedOwnedDocument({
      token,
      title: `e2e-seed-${Date.now()}`,
      content: 'e2e seed body',
    });

    try {
      // When
      await signInAs(page, user.email, user.password);
      await openDocumentManager(page);

      const openRow = page
        .locator(`[aria-label="Open document ${seeded.title}"]`)
        .locator('visible=true');
      await expect(openRow.first()).toBeVisible({ timeout: 60_000 });
      await openRow.first().click();

      const editBtn = page
        .locator('[aria-label="Edit document"]')
        .locator('visible=true');
      await expect(editBtn.first()).toBeVisible({ timeout: 30_000 });
      await editBtn.first().click();

      await expect(
        page.getByText('Edit document').locator('visible=true').first()
      ).toBeVisible({ timeout: 30_000 });

      const marker = ` [e2e-edit ${Date.now()}]`;
      const newTitle = `${seeded.title}${marker}`.slice(0, 200);
      const titleInput = page.locator(
        '[placeholder="Document title"]:visible'
      );
      await titleInput.fill(newTitle);

      const contentInput = page.locator(
        '[placeholder="Document content"]:visible'
      );
      const contentVal = await contentInput.inputValue();
      if (!contentVal.trim()) {
        await contentInput.fill('e2e edit content');
      }

      await page
        .locator('[aria-label="Save document"]')
        .locator('visible=true')
        .first()
        .click();

      // Then — wait on success UI / updated title (not a short fixed sleep only).
      await expect(
        page.getByText(newTitle).locator('visible=true').first()
      ).toBeVisible({ timeout: 60_000 });

      await screenshotProof(page, testInfo, 'documents-edit-saved.png');
    } finally {
      detach();
    }
  });
});
