import { expect, test, type Page } from '@playwright/test';

import { loginForApi, seedOwnedDocument } from '../documents/seed';
import { attachNoResendNoProtonGuard } from '../documents/ui';
import { apiBaseUrl } from '../helpers/env';
import { screenshotProof, utcYmd, visibleLabel } from '../helpers/ui';
import {
  createAndSelectCar,
  signInToCarManager,
  uniqueStamp,
} from './ui';

/**
 * Car Document links happy paths (epic #298).
 *
 * ```
 * Harness -> createEphemeralUser; optional seedOwnedDocument (API)
 * Browser -> /login -> hub -> Car Manager
 * alt Car create form
 *   Browser -> Create insurance document -> DocumentCreateForm draft (no POST /documents)
 *   Browser -> Choose registration document -> picker -> seeded Document
 *   Browser -> Submit create Car -> POST /cars (new_insurance_document + registration id)
 * else saved Car detail
 *   Browser -> Create registration document -> draft
 *   Browser -> PUT /cars/{id} (new_registration_document)
 * else maintenance event form
 *   Browser -> Create receipt -> draft "(new)"
 *   Browser -> Save maintenance event -> POST /car-maintenance-events (new_receipt_document)
 * end
 * Browser -> linked title on Car detail or event row
 * Harness -> GET /documents?title_contains -> exactly one Document with the role tag
 * ```
 */

type ListedDocument = { id: string; title: string; tags: string[] };

/** Owned Documents whose title contains `title`. */
async function documentsWithTitle(
  token: string,
  title: string
): Promise<ListedDocument[]> {
  const query = new URLSearchParams({ title_contains: title });
  const response = await fetch(
    `${apiBaseUrl()}/life-manager/api/v1/documents?${query}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }
  );
  if (!response.ok) {
    throw new Error(
      `GET /documents failed: ${response.status} ${await response.text()}`
    );
  }
  return (await response.json()) as ListedDocument[];
}

/** The Save must create the Document once, with the role tag. */
async function expectOneDocument(
  token: string,
  title: string,
  tag: string
): Promise<void> {
  const documents = await documentsWithTitle(token, title);
  expect(documents.map((d) => d.title)).toEqual([title]);
  expect(documents[0].tags).toContain(tag);
}

/** Fill the required content of the open DocumentCreateForm and submit it. */
async function submitDocumentDraft(
  page: Page,
  expectedTitle: string
): Promise<void> {
  const form = visibleLabel(page, 'Document create form');
  await expect(form).toBeVisible({ timeout: 15_000 });
  await expect(form.getByPlaceholder('Document title')).toHaveValue(
    expectedTitle
  );
  await form
    .getByPlaceholder('Document content')
    .fill(`e2e content for ${expectedTitle}`);
  await form.getByLabel('Submit', { exact: true }).click();
}

/** Sign in to Car Manager, and get an API token for seeds and checks. */
async function signInWithApiToken(page: Page): Promise<string> {
  const user = await signInToCarManager(page);
  return loginForApi(user.email, user.password);
}

test.describe('Car Document links happy paths', () => {
  let detachGuard: (() => void) | undefined;

  test.beforeEach(({ page }) => {
    detachGuard = attachNoResendNoProtonGuard(page);
  });

  test.afterEach(() => {
    detachGuard?.();
  });

  test('create Car with a new insurance Document and an existing registration Document', async ({
    page,
  }, testInfo) => {
    // Given — a signed-in user who owns one Document
    const token = await signInWithApiToken(page);
    const seeded = await seedOwnedDocument({
      token,
      title: `e2e-registration-${uniqueStamp()}`,
    });
    const make = 'Toyota';
    const model = `E2E-links-${uniqueStamp()}`;
    const year = '2018';
    const carLabel = `${year} ${make} ${model}`;
    const insuranceTitle = `${carLabel} insurance`;

    // When — the create form gets a new insurance draft and a picked registration
    await visibleLabel(page, 'Create Car').click();
    await visibleLabel(page, 'Create make').fill(make);
    await visibleLabel(page, 'Create model').fill(model);
    await visibleLabel(page, 'Create year').fill(year);

    await visibleLabel(page, 'Create create insurance document').click();
    await submitDocumentDraft(page, insuranceTitle);
    await expect(
      visibleLabel(
        page,
        'Selected insurance document, new, created when you save the Car'
      )
    ).toHaveText(`${insuranceTitle} (new)`);

    await visibleLabel(page, 'Choose registration document').click();
    await visibleLabel(page, `Choose document ${seeded.title}`).click();
    await visibleLabel(page, 'Select document').click();
    await expect(
      visibleLabel(page, 'Selected registration document')
    ).toHaveText(seeded.title);

    await visibleLabel(page, 'Submit create Car').click();

    // Then — the saved Car links both Documents
    const selectCar = visibleLabel(page, `Select Car ${carLabel}`);
    await expect(selectCar).toBeVisible({ timeout: 30_000 });
    await selectCar.click();
    await expect(
      visibleLabel(page, `Linked insurance document ${insuranceTitle}`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      visibleLabel(page, `Linked registration document ${seeded.title}`)
    ).toBeVisible();
    await expectOneDocument(token, insuranceTitle, 'insurance');
    await screenshotProof(page, testInfo, 'links-01-create-car.png');
  });

  test('create a registration Document from saved Car detail', async ({
    page,
  }, testInfo) => {
    // Given — a saved Car with no Document links
    const token = await signInWithApiToken(page);
    const { carLabel } = await createAndSelectCar(page, {
      modelPrefix: 'E2E-detail',
    });
    const registrationTitle = `${carLabel} registration`;

    // When — the user creates a registration Document from the Car detail
    await visibleLabel(page, 'Create registration document').click();
    await submitDocumentDraft(page, registrationTitle);

    // Then — the Car links the new Document, and insurance stays unset
    await expect(
      visibleLabel(page, `Linked registration document ${registrationTitle}`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(visibleLabel(page, 'No insurance document linked')).toBeVisible();
    await expectOneDocument(token, registrationTitle, 'registration');
    await screenshotProof(page, testInfo, 'links-02-car-detail.png');
  });

  test('create a receipt Document for a new maintenance event', async ({
    page,
  }, testInfo) => {
    // Given — a saved Car and an open maintenance event form
    const token = await signInWithApiToken(page);
    const { carLabel } = await createAndSelectCar(page, {
      modelPrefix: 'E2E-receipt',
    });
    const receiptTitle = `${carLabel} receipt`;
    const eventDate = utcYmd(0);

    await visibleLabel(page, 'Add maintenance event').scrollIntoViewIfNeeded();
    await visibleLabel(page, 'Add maintenance event').click();
    await expect(visibleLabel(page, 'Maintenance event form')).toBeVisible();
    await visibleLabel(page, 'Maintenance event date').fill(eventDate);
    await visibleLabel(page, 'Select event type Oil change').click();
    await visibleLabel(page, 'Maintenance title').fill(
      `e2e-oil-${uniqueStamp()}`
    );

    // When — the user drafts a receipt and saves the event
    await visibleLabel(page, 'Create receipt document').click();
    await submitDocumentDraft(page, receiptTitle);
    await expect(visibleLabel(page, 'Linked receipt document')).toHaveText(
      `${receiptTitle} (new)`
    );
    await visibleLabel(page, 'Save maintenance event').click();

    // Then — the event row shows the receipt, and the Document exists once
    await expect(
      visibleLabel(page, `Maintenance event Oil change on ${eventDate}`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(visibleLabel(page, `Receipt: ${receiptTitle}`)).toBeVisible();
    await expectOneDocument(token, receiptTitle, 'receipt');
    await screenshotProof(page, testInfo, 'links-03-receipt.png');
  });
});
