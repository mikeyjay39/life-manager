# life-manager e2e harness

Top-level Playwright suite for headless Chromium against **docker-dev**.

## Scripts

From `e2e/`:

```bash
npm ci
npm run playwright:install   # downloads Chromium (local + CI)
npm run stack:up             # generate .e2e.env, build, start life_manager_dev + frontend_dev
npm run stack:wait           # wait/retry GET /api/health and FRONTEND_URL
npm run test:e2e             # run Playwright
npm run stack:down           # tear down Compose project
```

## Chromium

Install browsers with `npm run playwright:install` in `e2e/`.
CI runs the same command before tests.
Host OS libs: `npx playwright install-deps` when Chromium fails to launch.

## Mail / auth (#259)

- `EMAIL_PROVIDER=capture` — full message bodies under `EMAIL_CAPTURE_DIR`
  (bind-mounted `backend/data/...`). Never Resend. Not body-redacted `log`.
- `APP_PUBLIC_BASE_URL` = e2e frontend origin (`/verify-email`, `/reset-password`).
- Ephemeral user helper: `helpers/auth.ts` `createEphemeralUser()` —
  signup API + capture verify link + verify API (shared by manager stories).
- Auth UI stories: `tests/auth-signup-verify.spec.ts`,
  `tests/auth-password-reset.spec.ts`.
- `scripts/activate-user.sh` (SQLite `active=1`) is retired; do not use it.

## Shared UI helpers

`helpers/ui.ts` holds helpers shared across manager and smoke specs:

- `visibleLabel` — Expo web visible control
- `signInToHub` / `signInAs` — login → manager hub
- `screenshotProof` — proof PNG under artifacts dir
- `utcYmd` — UTC `YYYY-MM-DD` for form dates

Prefer these over copy-paste locals in new scenarios.

## Manager scenarios

- Health Manager happy path (#256): `health/happy-path.spec.ts` —
  create HealthMember → add reading → add doctor visit (real UI).
- Playwright `testMatch` includes `tests/**` and `health/**`.

## Parallel runs

`scripts/generate-env.sh` sets a unique `COMPOSE_PROJECT_NAME`, ports, and
capture subdirectory from `GITHUB_RUN_ID` (or the local PID). Alloy is not
started for e2e.

## Artifacts

Do not commit PNG screenshots or captured `.eml` files. Playwright writes
failure screenshots under `test-results/` (gitignored). CI uploads them on
failure. Capture mail lives under `backend/data/` (already gitignored).
