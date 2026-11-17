import { expect, type Page, type Request } from '@playwright/test';

import { frontendUrl } from '../helpers/env';

const FORBIDDEN_HOST_RE =
  /(resend\.com|account\.proton\.me|mail\.proton\.me|drive-api\.proton\.me|proton\.me\/api)/i;

/**
 * Fail the test if the page calls Resend or Proton hosts.
 * Local life-manager API and static assets stay allowed.
 */
export function attachNoResendNoProtonGuard(page: Page): () => void {
  const onRequest = (request: Request) => {
    const url = request.url();
    if (FORBIDDEN_HOST_RE.test(url)) {
      throw new Error(`Forbidden external call during Documents e2e: ${url}`);
    }
  };
  page.on('request', onRequest);
  return () => page.off('request', onRequest);
}

/** Sign in in the browser with an ephemeral user. */
export async function signInAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const base = frontendUrl();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Username input').fill(email);
  await page.getByLabel('Password input').fill(password);
  await page.getByLabel('Sign in button').click();

  const hub = page
    .locator('[aria-label="Manager hub"]')
    .locator('visible=true');
  await expect(hub.first()).toBeVisible({ timeout: 60_000 });
}

/** Open Documents from the hub and wait for Document Manager chrome. */
export async function openDocumentManager(page: Page): Promise<void> {
  const docsTile = page
    .getByLabel('Documents', { exact: true })
    .locator('visible=true');
  await expect(docsTile.first()).toBeVisible({ timeout: 30_000 });
  await docsTile.first().click();

  await expect(
    page.getByText('Document Manager').locator('visible=true').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page
      .locator('[aria-label="Document list section"]')
      .locator('visible=true')
      .first()
  ).toBeVisible({ timeout: 60_000 });
}
