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
| Car Document links | `car/document-links.spec.ts` | Create-from-Car insurance, registration and receipt; pick an existing Document (epic #298). Shared Car helpers: `car/ui.ts` |
| Documents live extract | `documents/extract-from-file-live.spec.ts` | Real Gemini API, one request each run (#330). Needs `GEMINI_API_KEY`; skipped locally without it, fails in CI without it. Fixture: [`fixtures/README.md`](fixtures/README.md) |

Playwright `testMatch` includes `tests/**`, `health/**`, `documents/**`, and `car/**`.

Agent overview: [docs/agents/testing.md](../docs/agents/testing.md). Live branch UI proof still uses [`.cursor/skills/manual-test/`](../.cursor/skills/manual-test/); prefer this suite for shared manager coverage.

## Run the live extract test locally

`documents/extract-from-file-live.spec.ts` is the only spec that calls
`POST /documents/extract`. Do not add the call to other specs. It sends one
real Gemini request for each run, and it has `retries: 0`.

```bash
export GEMINI_API_KEY=<your dev key>   # generate-env.sh writes it to .e2e.env
./run-e2e.sh documents/extract-from-file-live.spec.ts
```

With manual steps, export the key before `bash scripts/up.sh`. `GEMINI_MODEL`
defaults to `gemini-3.5-flash-lite`. Each run uses one request of the daily
free-tier quota. A "Gemini quota" failure (HTTP 429) means that the quota is
used up. Do not run the test again until the quota resets. In CI, the key
comes from the GitHub Actions secret `GEMINI_API_KEY`.

The test reads the usage count with a read-only SELECT (`helpers/db.ts`).
It reads `E2E_DB_PATH` on the host first. When that file is missing (the
Docker daemon resolves the `backend/data` bind mount on its own side), it
copies the DB out of `life_manager_dev` with `docker compose exec` and
queries the copy. The mail helpers use the same fallback (`helpers/docker.ts`).

## Parallel runs

`scripts/generate-env.sh` sets a unique `COMPOSE_PROJECT_NAME`, ports, and
capture subdirectory from `GITHUB_RUN_ID` (or the local PID). Alloy is not
started for e2e. Stack images build locally on the runner or host (no ECR).

## Artifacts

Do not commit PNG screenshots or captured `.eml` files. Playwright writes
failure screenshots under `test-results/` (gitignored). On CI failure, download
Actions artifact `e2e-playwright-<run_id>-<attempt>` (`e2e/test-results/` and
`e2e/playwright-report/`). Capture mail lives under `backend/data/` (gitignored).
