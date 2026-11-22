# life-manager e2e harness

Top-level Playwright suite for headless Chromium against **docker-dev**.

## Scripts

From `e2e/`, prefer the wrapper for a full local run:

```bash
./run-e2e.sh                 # headless (same as CI); always stack:down on exit
./run-e2e.sh --headed        # visible browser when DISPLAY works
./run-e2e.sh --headed car/happy-path.spec.ts
./run-e2e.sh --debug         # Playwright inspector
./run-e2e.sh --ui            # Playwright UI mode
./run-e2e.sh --keep-stack    # leave Compose up after tests
./run-e2e.sh --skip-install  # skip npm ci / playwright:install
```

Playwright Test has **no** `--slow-mo` CLI flag. Use `--debug`, `--headed`,
or `launchOptions.slowMo` in `playwright.config.ts` when you need delay.

Manual steps (same flow as the wrapper / CI):

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
Chromium is **not** stored in git.
Host OS libs: `npx playwright install-deps` when Chromium fails to launch.

## Mail / auth (#259)

- `EMAIL_PROVIDER=capture` (`file` alias) — full message bodies under
  `EMAIL_CAPTURE_DIR` (bind-mounted `backend/data/...`). Never Resend.
  Not body-redacted `log`. Extract verify/reset links from the `.eml` files.
- `APP_PUBLIC_BASE_URL` = e2e frontend origin (`/verify-email`, `/reset-password`).
- Ephemeral user helper: `helpers/auth.ts` `createEphemeralUser()` —
  signup API + capture verify link + verify API (shared by manager stories).
- Auth UI stories: `tests/auth-signup-verify.spec.ts`,
  `tests/auth-password-reset.spec.ts`.
- Documents Manager happy path (#255): `documents/documents-happy-path.spec.ts`
  (seed via multipart API, no Proton; `:visible` / `visible=true` locators).
- `scripts/activate-user.sh` (SQLite `active=1`) is retired; do not use it.

## Shared UI helpers

`helpers/ui.ts` holds helpers shared across manager and smoke specs:

- `visibleLabel` — Expo web visible control
- `signInToHub` / `signInAs` — login → manager hub
- `screenshotProof` — proof PNG under artifacts dir
- `utcYmd` — UTC `YYYY-MM-DD` for form dates

Prefer these over copy-paste locals in new scenarios.

## Suite map

| Area | Spec path | Notes |
|------|-----------|--------|
| Smoke | `tests/smoke.spec.ts` | Sign-in to manager hub (#254) |
| Auth UI | `tests/auth-signup-verify.spec.ts`, `tests/auth-password-reset.spec.ts` | Capture mail (#259) |
| Health | `health/happy-path.spec.ts` | Member, reading, visit (#256) |
| Documents | `documents/documents-happy-path.spec.ts` | Open + edit seeded doc (#255) |
| Car | `car/happy-path.spec.ts` | Create, maintenance, edit, deactivate, delete (#257) |

Playwright `testMatch` includes `tests/**`, `health/**`, `documents/**`, and `car/**`.

Agent overview: [docs/agents/testing.md](../docs/agents/testing.md). Live branch UI proof still uses [`.cursor/skills/manual-test/`](../.cursor/skills/manual-test/); prefer this suite for shared manager coverage.

## Parallel runs

`scripts/generate-env.sh` sets a unique `COMPOSE_PROJECT_NAME`, ports, and
capture subdirectory from `GITHUB_RUN_ID` (or the local PID). Alloy is not
started for e2e. Stack images build locally on the runner or host (no ECR).

## Artifacts

Do not commit PNG screenshots or captured `.eml` files. Playwright writes
failure screenshots under `test-results/` (gitignored). On CI failure, download
Actions artifact `e2e-playwright-<run_id>-<attempt>` (`e2e/test-results/` and
`e2e/playwright-report/`). Capture mail lives under `backend/data/` (gitignored).
