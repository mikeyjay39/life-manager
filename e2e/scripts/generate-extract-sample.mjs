// Make e2e/fixtures/extract-sample-insurance.png for the live extract e2e test (#330).
//
// The image is fictional. It is made from the text below; it is not a photo
// of a real document. Run it again only when the expected fields change:
//
//   cd e2e && node scripts/generate-extract-sample.mjs
//
// It uses the Chromium from @playwright/test, so it needs no new dependency.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(
  SCRIPT_DIR,
  '..',
  'fixtures',
  'extract-sample-insurance.png'
);

const CARD_LINES = [
  'Northwind Auto Insurance',
  'Car Insurance Policy',
  'Policy number: LM-E2E-48213',
  'Effective date: 2027-01-01',
  'Expiration date: 2027-12-31',
];

const CARD_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#fff;">
    <div id="card" style="
      width:800px;height:450px;box-sizing:border-box;padding:48px;
      background:#fff;color:#000;
      font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1.6;">
      ${CARD_LINES.map((line) => `<div>${line}</div>`).join('\n      ')}
    </div>
  </body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 550 } });
  await page.setContent(CARD_HTML);
  await page.locator('#card').screenshot({ path: OUTPUT_PATH });
  console.log(`Wrote ${OUTPUT_PATH}`);
} finally {
  await browser.close();
}
