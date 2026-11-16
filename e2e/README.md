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

## Mail / auth (#254)

- `EMAIL_PROVIDER=log` — never Resend.
- Ephemeral user: signup API, then temporary SQLite `active=1` (`scripts/activate-user.sh`).
- Story **#259** replaces activation with capture/file mail + verify UI.

## Parallel runs

`scripts/generate-env.sh` sets a unique `COMPOSE_PROJECT_NAME` and ports from
`GITHUB_RUN_ID` (or the local PID). Alloy is not started for e2e.

## Artifacts

Do not commit PNG screenshots. Playwright writes failure screenshots under
`test-results/` (gitignored). CI uploads them on failure.
