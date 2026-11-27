import { expect, test, type Page, type Response } from '@playwright/test';
import path from 'node:path';

import { createEphemeralUser } from '../helpers/auth';
import { readExtractionUsageCount } from '../helpers/db';
import {
  apiBaseUrl,
  assertEmailProviderIsCapture,
  loadE2eEnvFile,
} from '../helpers/env';
import { screenshotProof, signInAs, visibleLabel } from '../helpers/ui';
import { loginForApi } from './seed';
import { attachNoResendNoProtonGuard, openDocumentManager } from './ui';

/**
 * Documents live Extract From File (#330). This is the only spec that calls
 * POST /documents/extract. It sends one real Gemini request for each run.
 *
 * ```
 * Harness -> createEphemeralUser (signup + capture verify)
 * Browser -> /login -> hub -> Documents -> Add document
 * Browser -> Extract From File (one click) -> file chooser : fixture PNG
 * Browser -> API : POST /documents/extract (one request)
 * API -> Gemini : generateContent (one request)
 * Browser -> assert banner + fields -> Submit
 * Harness -> API : GET /documents/{id} : dates + title
 * Harness -> SQLite (read-only) : SELECT usage count = 1
 * ```
 */

// Dates and the banner are deterministic, so they use an exact value. An LLM
// does not give the same title, summary, and tags on each run, so they use a
// case-insensitive "contains" check.
const EXPECTED = {
  fileName: 'extract-sample-insurance.png',
  banner: 'Filled 5 fields from extract-sample-insurance.png',
  issuedDate: '2027-01-01',
  expireDate: '2027-12-31',
  keyword: 'insurance',
  maxSummaryChars: 200,
} as const;

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', EXPECTED.fileName);
const EXTRACT_PATH_SUFFIX = '/documents/extract';
const CREATE_DOCUMENT_PATH_SUFFIX = '/life-manager/api/v1/documents';

type ApiDocument = {
  title?: string;
  issued_date?: string | null;
  expire_date?: string | null;
};

// The CI default is `retries: 1`. A retry sends a second Gemini request.
test.describe.configure({ retries: 0 });

/**
 * Stop before any network call when no key is set: fail in CI (the secret
 * is missing), skip locally. Never put the key value in a message.
 */
function requireGeminiKeyOrSkip(): void {
  loadE2eEnvFile();
  if (process.env.GEMINI_API_KEY?.trim()) {
    return;
  }
  if (process.env.CI) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add the GitHub Actions secret GEMINI_API_KEY (see #318); the live extract test needs it.'
    );
  }
  test.skip(true, 'GEMINI_API_KEY not set; live extract test skipped');
}

function isPost(response: Response, pathSuffix: string): boolean {
  return (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname.endsWith(pathSuffix)
  );
}

/** Fail with a clear message. Never retry: each try spends Gemini quota. */
async function assertExtractSucceeded(response: Response): Promise<void> {
  if (response.ok()) {
    return;
  }
  const body = await response.text();
  if (response.status() === 429) {
    throw new Error(`Gemini quota used up (HTTP 429): ${body}`);
  }
  throw new Error(`Extract failed: HTTP ${response.status()} ${body}`);
}

async function extractFixture(page: Page): Promise<void> {
  const extractResponse = page.waitForResponse(
    (response) => isPost(response, EXTRACT_PATH_SUFFIX),
    { timeout: 60_000 }
  );
  const chooser = page.waitForEvent('filechooser');
  await visibleLabel(page, 'Extract From File').click();
  await (await chooser).setFiles(FIXTURE_PATH);
  await assertExtractSucceeded(await extractResponse);
}

async function expectExtractedFields(page: Page): Promise<void> {
  await expect(visibleLabel(page, 'Issue date')).toHaveValue(
    EXPECTED.issuedDate
  );
  await expect(visibleLabel(page, 'Expire date')).toHaveValue(
    EXPECTED.expireDate
  );

  const title = await page
    .locator('[placeholder="Document title"]:visible')
    .inputValue();
  expect(title.toLowerCase()).toContain(EXPECTED.keyword);

  const summary = await page
    .locator('[placeholder="Document content"]:visible')
    .inputValue();
  expect(summary.trim()).not.toBe('');
  expect(summary.length).toBeLessThanOrEqual(EXPECTED.maxSummaryChars);
  expect(summary.toLowerCase()).toContain(EXPECTED.keyword);

  const tags = await page
    .locator('[placeholder="e.g. work, notes"]:visible')
    .inputValue();
  expect(tags.toLowerCase()).toContain(EXPECTED.keyword);
}

async function submitAndReadDocumentId(page: Page): Promise<string> {
  const createResponse = page.waitForResponse(
    (response) => isPost(response, CREATE_DOCUMENT_PATH_SUFFIX),
    { timeout: 60_000 }
  );
  await visibleLabel(page, 'Submit').click();
  const response = await createResponse;
  if (!response.ok()) {
    throw new Error(
      `Create document failed: HTTP ${response.status()} ${await response.text()}`
    );
  }
  const created = (await response.json()) as { id?: string };
  if (!created.id) {
    throw new Error(
      `Create document response has no id: ${JSON.stringify(created)}`
    );
  }
  return created.id;
}

async function fetchDocument(token: string, id: string): Promise<ApiDocument> {
  const response = await fetch(
    `${apiBaseUrl()}/life-manager/api/v1/documents/${id}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(
      `GET document failed: HTTP ${response.status} ${await response.text()}`
    );
  }
  return (await response.json()) as ApiDocument;
}

test.describe('Documents live Extract From File', () => {
  test('given sample insurance image when Extract From File then fields match and one Gemini request is used', async ({
    page,
  }, testInfo) => {
    // Given
    requireGeminiKeyOrSkip();
    assertEmailProviderIsCapture();
    const detach = attachNoResendNoProtonGuard(page);
    let extractRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith(EXTRACT_PATH_SUFFIX)
      ) {
        extractRequests += 1;
      }
    });

    try {
      const user = await createEphemeralUser();
      const token = await loginForApi(user.email, user.password);
      await signInAs(page, user.email, user.password);
      await openDocumentManager(page);
      await visibleLabel(page, 'Add document').click();
      await expect(
        page
          .locator('[aria-label="Document create form"]')
          .locator('visible=true')
          .first()
      ).toBeVisible({ timeout: 30_000 });

      // When
      await extractFixture(page);

      // Then
      await expect(
        page
          .getByText(EXPECTED.banner, { exact: false })
          .locator('visible=true')
          .first()
      ).toBeVisible({ timeout: 60_000 });
      await expectExtractedFields(page);

      const id = await submitAndReadDocumentId(page);
      const saved = await fetchDocument(token, id);
      expect(saved.issued_date ?? '').toMatch(new RegExp(`^${EXPECTED.issuedDate}`));
      expect(saved.expire_date ?? '').toMatch(new RegExp(`^${EXPECTED.expireDate}`));
      expect((saved.title ?? '').toLowerCase()).toContain(EXPECTED.keyword);

      expect(extractRequests).toBe(1);
      expect(readExtractionUsageCount(id)).toBe(1);

      await screenshotProof(page, testInfo, 'documents-extract-live.png');
    } finally {
      detach();
    }
  });
});
