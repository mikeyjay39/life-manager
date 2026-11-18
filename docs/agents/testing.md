# Testing (agents)

Parent hub: [../../AGENTS.md](../../AGENTS.md).

Match CI: [`.github/workflows/main.yml`](../../.github/workflows/main.yml).

**Triggers:** `pull_request` runs unit/integration when the PR is ready (path filters apply). The **`e2e-tests`** job runs when the PR **base** is `main` (and on **push to `main`**). Story PRs into a feature branch do not get Actions e2e; workers dry-run locally. On **push to `main`**, after unit, integration, and e2e pass, CI builds and pushes prod images to ECR only when their directories changed (`backend/` → `life-manager-backend`, `frontend/` → `life-manager-frontend`, `nginx/` → `life-manager-gateway`, `observability/` → `alloy`), then always deploys on Lightsail via SSH. Sequence diagram: [architecture.md — CI deploy to AWS](../architecture.md#ci-deploy-to-aws-merge-to-main).

**Manual Lightsail relaunch:** workflow [`.github/workflows/deploy-lightsail.yml`](../../.github/workflows/deploy-lightsail.yml) (`workflow_dispatch`). Use **Actions → Deploy Lightsail → Run workflow** to pull `main` and redeploy existing `:latest` images without running tests or rebuilding ECR.

**deliver-feature story PRs:** base is the feature branch, so Actions does not run. Workers must run the unit and integration commands below locally inside **pr-review-loop** (see [`.cursor/skills/deliver-feature/`](../../.cursor/skills/deliver-feature/)).

## Commands

**Frontend (Vitest):**

```bash
cd frontend && npm ci && npm run test:run
npm run lint   # if frontend changed
```

**Playwright e2e (top-level `e2e/`, CI job `e2e-tests`):** owns `@playwright/test` under `e2e/` (not Vitest). Boots **docker-dev** (`life_manager_dev` + `frontend_dev` only). Images build on the runner (or local host); do **not** pull ECR for e2e. Mail: `EMAIL_PROVIDER=capture` (`file` is an alias) with a unique `EMAIL_CAPTURE_DIR` under `backend/data/` — never Resend; not body-redacted `log`. Read verify/reset links from the captured `.eml` files. `APP_PUBLIC_BASE_URL` is the e2e frontend origin. Alloy/Grafana are optional and skipped. Unique `COMPOSE_PROJECT_NAME` / ports / capture path per run. Wait/retry on `GET /api/health` (`up` / `"up"`) and the frontend URL before tests.

Chromium: run `npm run playwright:install` in `e2e/` (local and CI). Browsers are **not** committed in git.

On failure, CI uploads Actions artifact `e2e-playwright-<run_id>-<attempt>` from `e2e/test-results/` and `e2e/playwright-report/`. Do not commit PNGs or captured `.eml`.

```bash
cd e2e && npm ci && npm run playwright:install
npm run stack:up && npm run stack:wait
npm run test:e2e
npm run stack:down
```

Details: [../../e2e/README.md](../../e2e/README.md). Auth e2e (#259): `createEphemeralUser()` signs up, reads the captured verify link, and verifies via API; UI specs cover signup/verify and password-reset. Health: `e2e/health/happy-path.spec.ts` (#256). Documents: `e2e/documents/` (#255). Car: `e2e/car/happy-path.spec.ts` (#257) — create, maintenance, edit, deactivate, and delete. See the e2e README suite map.

**Playwright (manual-test skill):** `playwright` remains a frontend devDependency for [`.cursor/skills/manual-test/`](../../.cursor/skills/manual-test/). Fetch Chromium with `cd frontend && npm run playwright:install`. For shared manager coverage, prefer the top-level `e2e/` suite; keep the skill for live branch proof.

**Backend unit:**

```bash
./backend/scripts/write_rev.sh
cargo test --lib --workspace --manifest-path backend/Cargo.toml
```

**TypeScript DTO export** (CI also checks generated output is committed):

```bash
./backend/scripts/export_ts_bindings.sh
git diff --exit-code -- frontend/lib/api/generated/
```

**Backend integration** (Docker via testcontainers — `backend/tests/common/`):

```bash
./backend/scripts/write_rev.sh
cd backend && cargo test --test '*'
```

**Optional Rust checks** (installed in CI; not always run in workflow):

```bash
cargo fmt --manifest-path backend/Cargo.toml -- --check
cargo clippy --workspace --manifest-path backend/Cargo.toml --all-targets -- -D warnings
```

## Layout

- Frontend: co-locate `*.test.tsx` next to components (Vitest)
- Backend unit: `#[cfg(test)]` in modules (e.g. `document_handler.rs`)
- Backend integration: `backend/tests/*_tests.rs`
- Headless e2e: top-level `e2e/` (Playwright + docker-dev; CI job `e2e-tests`)

## Ignored tests

Some tests use `#[ignore]` (e.g. docker-compose integration in `documents_tests.rs`, Ollama adapter tests). Normal `cargo test --test '*'` **does not run** them unless `--ignored`. Do not assume they passed.

## BDD / Gherkin style

Add behavior-focused unit tests for new features whenever possible. Use **Given / When / Then** via test names, Arrange–Act–Assert, and/or comments. Reuse **Given\*** fixtures or setup helpers.

**Frontend example (Vitest):**

```typescript
it('given no token when rendering then shows sign-in message', () => {
  // Given
  mockUseAuth.mockReturnValue(defaultAuth({ token: null }));
  // When
  render(<DocumentList />);
  // Then
  expect(screen.getByText('Sign in to see your documents.')).toBeTruthy();
});
```

**Backend example (Rust):**

```rust
#[tokio::test]
async fn test_get_document() {
    // Given
    let GivenUserAndDocuments { auth_user, document1_id, .. } = given_user_and_documents().await;
    // When
    let response = get_document(auth_user, State(...), Path(document1_id)).await;
    // Then
    assert_eq!(response.status(), StatusCode::OK);
}
```

See [../../backend/AGENTS.md](../../backend/AGENTS.md) and [../../frontend/AGENTS.md](../../frontend/AGENTS.md) for stack-specific patterns and example files.
