# e2e fixtures

| File | Content | Expected extract fields |
|------|---------|-------------------------|
| `extract-sample-insurance.png` | A fictional, generated car insurance card. Text lines: `Northwind Auto Insurance`, `Car Insurance Policy`, `Policy number: LM-E2E-48213`, `Effective date: 2027-01-01`, `Expiration date: 2027-12-31`. | `issued_date` = `2027-01-01`. `expire_date` = `2027-12-31`. `title`, `summary` (200 characters or fewer), and `tags` contain `insurance` (case-insensitive). The UI banner contains `Filled 5 fields from extract-sample-insurance.png`. |

`documents/extract-from-file-live.spec.ts` (#330) uses `extract-sample-insurance.png`.

All text in the image is fictional. It does not show a real person, company, or policy.

## Regenerate the image

Do this only when the expected fields change. Then update this table and the spec.

```bash
cd e2e && node scripts/generate-extract-sample.mjs
```

The script uses the Chromium from `@playwright/test` (run `npm ci` and `npm run playwright:install` first). Keep the file under 200 KB.
