/**
 * Headless UI smoke for the manual-test skill.
 *
 * Run from frontend/ so `playwright` resolves from node_modules:
 *
 *   set -a && source ../.dev.env && set +a
 *   export FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
 *   node ../.cursor/skills/manual-test/scripts/ui-smoke.mjs
 *
 * Requires ADMIN_USERNAME and ADMIN_PASSWORD. Do not print them.
 * Expo web can mount hidden duplicate controls — use :visible locators.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.FRONTEND_URL || 'http://localhost:8080';
const USER = process.env.ADMIN_USERNAME;
const PASS = process.env.ADMIN_PASSWORD;
const outDir = process.env.PLAYWRIGHT_ARTIFACTS_DIR || '/tmp/lm-playwright-artifacts';

if (!USER || !PASS) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD required');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const result = {
  login: 'fail',
  viewDocuments: 'fail',
  editDocument: 'fail',
  notes: [],
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  page.setDefaultTimeout(60000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${outDir}/01-home.png`, fullPage: true });

  const signInLink = page.getByRole('link', { name: /sign in|log in/i }).first();
  if (await signInLink.count()) {
    await signInLink.click();
    await page.waitForTimeout(1000);
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  }

  await page.getByLabel('Username input').fill(USER);
  await page.getByLabel('Password input').fill(PASS);
  await page.getByLabel('Sign in button').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outDir}/02-after-login.png`, fullPage: true });

  const docsHeading = page.getByText('Your documents');
  const loginStill = page.getByLabel('Sign in button');
  if (await docsHeading.count()) {
    result.login = 'pass';
    result.notes.push('Saw "Your documents" after login');
  } else if (await loginStill.count()) {
    const alert = page.getByRole('alert');
    const alertText = (await alert.count()) ? await alert.innerText() : '(no alert)';
    result.notes.push(`Login form still present; alert=${alertText}`);
    throw new Error('Login did not reach documents UI');
  } else {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    if (await docsHeading.count()) {
      result.login = 'pass';
    } else {
      result.notes.push('No documents heading after navigation');
      throw new Error('Could not confirm login');
    }
  }

  await page.screenshot({ path: `${outDir}/03-documents.png`, fullPage: true });

  const emptyHint = page.getByText('No documents yet.');
  const visibleOpen = page.locator('[aria-label^="Open document "]:visible');
  const openCount = await visibleOpen.count();
  if (!openCount) {
    if (await emptyHint.count()) {
      result.viewDocuments = 'fail';
      result.notes.push('Logged in but no documents to view/edit');
      throw new Error('No documents available');
    }
    result.notes.push('No visible Open document rows found');
    throw new Error('Document rows not found');
  }

  let openDoc = visibleOpen.first();
  for (let i = 0; i < openCount; i++) {
    const label = (await visibleOpen.nth(i).getAttribute('aria-label')) || '';
    if (/another test|do you work|will this work|testing refresh/i.test(label)) {
      openDoc = visibleOpen.nth(i);
      break;
    }
  }

  const firstLabel = await openDoc.getAttribute('aria-label');
  result.notes.push(`Opening: ${firstLabel} (visible rows=${openCount})`);
  await openDoc.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/04-doc-modal.png`, fullPage: true });

  const editBtn = page.locator('[aria-label="Edit document"]:visible');
  await editBtn.waitFor({ state: 'visible' });
  result.viewDocuments = 'pass';

  await editBtn.click();
  await page.waitForTimeout(500);
  await page.getByText('Edit document').waitFor({ state: 'visible' });

  const titleInput = page.locator('[placeholder="Document title"]:visible');
  const contentInput = page.locator('[placeholder="Document content"]:visible');
  const oldTitle = await titleInput.inputValue();
  const marker = ` [ui-smoke ${Date.now()}]`;
  const newTitle = (oldTitle + marker).slice(0, 200);
  await titleInput.fill(newTitle);

  const contentVal = await contentInput.inputValue();
  if (!contentVal.trim()) {
    await contentInput.fill('ui-smoke content');
  }

  await page.screenshot({ path: `${outDir}/05-editing.png`, fullPage: true });
  await page.locator('[aria-label="Save document"]:visible').click();

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/06-after-save.png`, fullPage: true });

  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes(marker.trim()) || bodyText.includes(newTitle.slice(0, 40))) {
    result.editDocument = 'pass';
    result.notes.push(`Title updated with marker; old="${oldTitle.slice(0, 40)}"`);
  } else {
    const closeBtn = page.locator('[aria-label="Close document"]:visible');
    if (await closeBtn.count()) await closeBtn.click();
    await page.waitForTimeout(1000);
    const visibleRefresh = page.locator('[aria-label="Refresh documents"]:visible');
    if (await visibleRefresh.count()) await visibleRefresh.first().click();
    await page.waitForTimeout(1500);
    const after = await page.locator('body').innerText();
    if (after.includes(marker.trim())) {
      result.editDocument = 'pass';
      result.notes.push('Marker found in list after refresh');
    } else {
      result.notes.push('Save clicked but marker not found in UI text');
      throw new Error('Edit not confirmed in UI');
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.login !== 'pass' || result.viewDocuments !== 'pass' || result.editDocument !== 'pass') {
    process.exit(2);
  }
} catch (err) {
  result.notes.push(String(err));
  await page.screenshot({ path: `${outDir}/error.png`, fullPage: true }).catch(() => {});
  console.log(JSON.stringify(result, null, 2));
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
