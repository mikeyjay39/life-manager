/**
 * Smoke: Vimium textInputXPath finds Car/Health typed fields; typing sticks.
 *
 * Run from frontend/ with stack up:
 *
 *   set -a && source ../.dev.env && set +a
 *   export FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
 *   node scripts/vimium-fields-smoke.mjs
 *
 * Requires ADMIN_USERNAME and ADMIN_PASSWORD. Do not print them.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../package.json'));
const { chromium } = require('playwright');

const { VIMIUM_TEXT_INPUT_XPATH } = await import(
  pathToFileURL(path.resolve(here, '../lib/vimium/text-input-xpath.mjs')).href
);

const BASE = process.env.FRONTEND_URL || 'http://localhost:8080';
const USER = process.env.ADMIN_USERNAME;
const PASS = process.env.ADMIN_PASSWORD;
const outDir = process.env.PLAYWRIGHT_ARTIFACTS_DIR || '/tmp/lm-vimium-smoke';

if (!USER || !PASS) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD required');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const result = {
  carXpath: 'fail',
  carTyping: 'fail',
  healthXpath: 'fail',
  healthTyping: 'fail',
  lockedNotesNotTarget: 'fail',
  notes: [],
};

function writeResult() {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Username input').fill(USER);
  await page.getByLabel('Password input').fill(PASS);
  await page.getByLabel('Sign in button').click();
  await page.waitForTimeout(2000);
}

async function visibleXpathArias(page) {
  return page.evaluate((xpath) => {
    const snap = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    const out = [];
    for (let i = 0; i < snap.snapshotLength; i++) {
      const el = snap.snapshotItem(i);
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      out.push({
        aria: el.getAttribute('aria-label') || el.tagName,
        tag: el.tagName,
        readOnly: !!el.readOnly,
      });
    }
    return out;
  }, VIMIUM_TEXT_INPUT_XPATH);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(60000);

try {
  await login(page);

  // Car page without create modal: maintenance notes are locked.
  await page.goto(`${BASE}/car`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const lockedNotesOnPage = page.getByLabel('Maintenance notes', { exact: true });
  if ((await lockedNotesOnPage.count()) === 0) {
    result.notes.push('Maintenance notes field not on Car page before create');
  } else {
    const locked = await visibleXpathArias(page);
    const lockedNotes = locked.filter((m) => m.aria === 'Maintenance notes');
    if (lockedNotes.length === 0) {
      result.lockedNotesNotTarget = 'pass';
      result.notes.push('Locked Maintenance notes on page but not in Vimium XPath');
    } else {
      result.notes.push(
        `Locked Maintenance notes still matched Vimium (${lockedNotes.length})`,
      );
    }
  }

  await page.getByLabel('Create Car').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/car-create.png`, fullPage: true });

  const carMatches = await visibleXpathArias(page);
  const carArias = carMatches.map((m) => m.aria);
  const needCar = [
    'Create make',
    'Create model',
    'Create year',
    'Create notes',
  ];
  const missingCar = needCar.filter((a) => !carArias.includes(a));
  if (missingCar.length) {
    result.notes.push(`Car XPath missing: ${missingCar.join(', ')}`);
  } else {
    result.carXpath = 'pass';
    result.notes.push(`Car XPath matched ${carArias.length} visible fields`);
  }

  const make = page.getByLabel('Create make', { exact: true });
  await make.click();
  await make.fill('HondaSmoke');
  if ((await make.inputValue()) === 'HondaSmoke') {
    result.carTyping = 'pass';
    result.notes.push('Create make value stuck after fill');
  } else {
    result.notes.push('Create make value did not stick');
  }

  await page.evaluate((xpath) => {
    const snap = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    for (let i = 0; i < snap.snapshotLength; i++) {
      const el = snap.snapshotItem(i);
      if (el.getAttribute('aria-label') === 'Create model') {
        el.focus();
        return;
      }
    }
  }, VIMIUM_TEXT_INPUT_XPATH);
  await page.keyboard.type('CivicSmoke');
  await page.waitForTimeout(200);
  const modelVal = await page
    .getByLabel('Create model', { exact: true })
    .inputValue();
  if (modelVal === 'CivicSmoke') {
    result.notes.push('Create model stuck after Vimium-like focus + keyboard');
  } else {
    result.carTyping = 'fail';
    result.notes.push(`Create model after keyboard: ${JSON.stringify(modelVal)}`);
  }

  await page.getByLabel('Cancel create Car').click();
  await page.waitForTimeout(400);

  await page.goto(`${BASE}/health`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByLabel('Create HealthMember').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/health-create.png`, fullPage: true });

  const healthArias = (await visibleXpathArias(page)).map((m) => m.aria);
  const needHealth = ['Create display name', 'Create notes'];
  const missingHealth = needHealth.filter((a) => !healthArias.includes(a));
  if (missingHealth.length) {
    result.notes.push(`Health XPath missing: ${missingHealth.join(', ')}`);
  } else {
    result.healthXpath = 'pass';
    result.notes.push('Health XPath matched create fields');
  }

  const name = page.getByLabel('Create display name', { exact: true });
  await name.click();
  await name.fill('HealthSmoke');
  if ((await name.inputValue()) === 'HealthSmoke') {
    result.healthTyping = 'pass';
    result.notes.push('Create display name value stuck after fill');
  } else {
    result.notes.push('Create display name value did not stick');
  }

  writeResult();

  if (
    result.carXpath !== 'pass' ||
    result.carTyping !== 'pass' ||
    result.healthXpath !== 'pass' ||
    result.healthTyping !== 'pass' ||
    result.lockedNotesNotTarget !== 'pass'
  ) {
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e);
  result.notes.push(String(e));
  writeResult();
  await page.screenshot({ path: `${outDir}/error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
