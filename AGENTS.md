# life-manager — agent instructions

Personal/family life-management app. **Documents** are implemented today; medical, location, car, and receipt managers are planned (see [README.md](README.md)).

## Contents

- [Docs to read first](#docs-to-read-first)
- [Critical Rules](#critical-rules)
- [Do not assume](#do-not-assume)
- [Operations to avoid](#operations-to-avoid)
- [Scope](#scope)
- [Architecture (backend)](#architecture-backend)
- [Architecture (frontend)](#architecture-frontend)
- [API conventions](#api-conventions)
- [Canonical examples](#canonical-examples)
- [Best Practices](#best-practices)
- [Before changing code](#before-changing-code)
- [Definition of done](#definition-of-done)
- [Run locally](#run-locally)
- [Test (match CI)](#test-match-ci)
- [Database (Diesel + SQLite)](#database-diesel--sqlite)
- [Docker / Compose](#docker--compose)
- [Git and PRs](#git-and-prs)
- [Nested agent instructions](#nested-agent-instructions)
- [When unsure](#when-unsure)

Monorepo layout:

| Path | Stack |
|------|--------|
| `backend/` | Rust (Axum, Diesel/SQLite, Tokio) — see [backend/AGENTS.md](backend/AGENTS.md) |
| `frontend/` | Expo / React Native (expo-router, Vitest) — see [frontend/AGENTS.md](frontend/AGENTS.md) |
| Root | `docker-compose.yml`, `build_and_start_app.sh` |

## Docs to read first

| Doc | Use for |
|-----|---------|
| [README.md](README.md) | Run profiles, ports, Diesel setup, domain diagram (Member, Document, Alert) |
| [docs/development_faq.md](docs/development_faq.md) | Postman multipart uploads, tests, git-crypt, local HTTP |
| [docs/todos.md](docs/todos.md) | Planned work — do not implement unless asked |
| [frontend/README.md](frontend/README.md) | Frontend-specific setup |

## Critical Rules

These rules override other sections in this file. Violating them is never acceptable.

### Git (read-only for agents)

**Agents never run state-changing git commands** — even when the user asks. The user runs `git commit`, `git push`, `git merge`, etc. locally.

Do **not** run any git command that changes repository state, remotes, or history.

**Never run:** `git add`, `git commit`, `git push`, `git pull`, `git merge`, `git rebase`, `git cherry-pick`, `git revert`, `git reset`, `git checkout`, `git switch`, `git restore`, `git clean`, `git stash`, `git rm`, `git mv`, `git tag`, `git branch` (delete/rename), `git push --force`, `git config` (set/unset).

**OK for inspection:** `git status`, `git diff`, `git log`, `git show`, `git branch` (list), `git rev-parse`, `git describe`.

### Database (read-only for agents)

Do **not** run ad-hoc **non-read** SQL or CLI that mutates schema/data.

**Never run:** `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `REPLACE`, or equivalents; `diesel migration run`, `diesel database reset`, or other Diesel/CLI commands that apply or revert migrations; manual `sqlite3` (or other clients) with write statements.

**OK:**

- `SELECT` and read-only schema inspection; `diesel migration list` / `diesel print-schema`
- Reading or **authoring** migration **files** under `backend/migrations/` (user applies migrations and regenerates `schema.rs`)
- **`cargo test`** and **`cargo run`** — the app and test harness manage their own DB lifecycle; do not run separate manual write SQL/CLI outside that

## Do not assume

- **Do not guess** requirements, behavior, env/config values, deployment targets, or user intent.
- If anything is unclear, ambiguous, or missing from the repo/docs, **stop and ask the user** before writing code or running commands — do not invent behavior or fill gaps with assumptions.
- Read the codebase and linked docs first; when that is not enough, ask a focused question rather than proceeding on a guess.

## Operations to avoid

Unless the user explicitly asks to run these in the current message, do **not**:

- `./build_and_start_app.sh prod` or prod Docker Compose stacks on a real host
- [`scripts/deploy-prod-lightsail.sh`](scripts/deploy-prod-lightsail.sh) or any deploy/ECR/SSH steps (CI handles prod deploy on `main`)
- `docker compose up` with **prod** profile against shared/production infrastructure
- Unlocking or modifying **git-crypt** secrets without user guidance ([docs/development_faq.md](docs/development_faq.md))

## Scope

- Do **not** implement items in [docs/todos.md](docs/todos.md) (TLS swap, Ollama → cloud, etc.) unless the user explicitly requests that work.
- New document-related features should respect domain aggregates in [README.md](README.md) (Member, Document, DocumentId, MemberId, Alert).

## Architecture (backend)

Follow the existing layered layout under `backend/src/`:

- **`domain/`** — entities, value objects, domain traits (no infrastructure imports).
  - Cannot import from `application/` or `infrastructure/`.
- **`application/`** — use cases, commands/queries, repository traits.
  - Can import from `domain/` but not `infrastructure/`.
- **`infrastructure/`** — HTTP handlers, Diesel ORM, adapters (Tesseract, Ollama, JWT auth).
  - Can import from any layer.

Add features by extending domain/application first, then wiring infrastructure. Match patterns in nearby modules (e.g. `infrastructure/document/` for document APIs).

Rust **edition 2024** ([`backend/Cargo.toml`](backend/Cargo.toml)). More detail: [backend/AGENTS.md](backend/AGENTS.md).

## Architecture (frontend)

| Path | Role |
|------|------|
| `frontend/app/` | Expo Router screens and layouts (`_layout.tsx`, `(tabs)/`, `login.tsx`) |
| `frontend/components/` | Reusable UI; co-locate `*.test.tsx` |
| `frontend/contexts/` | Shared state (e.g. `AuthContext`) |
| `frontend/lib/` | API client, helpers (`@/lib/...`) |
| `frontend/constants/` | Config (`API_BASE_URL` in `config.ts`) |

Use the `@/` path alias (see `frontend/tsconfig.json`). More detail: [frontend/AGENTS.md](frontend/AGENTS.md).

## API conventions

| Endpoint | Notes |
|----------|--------|
| `GET /api/health` | Returns `"up"` |
| `GET /api/version` | Build/git revision string |
| `POST /api/v1/auth/login` | JWT login |
| `GET /api/v1/auth/protected` | Auth smoke test |
| `POST /api/v1/documents/` | Multipart: `json` (CreateDocumentCommand) + `file` |
| `GET /api/v1/documents/{id}` | Single document |
| `GET /api/v1/documents/` | Query by title |

- Protected routes expect `Authorization: Bearer <token>`.
- Multipart upload examples: [docs/development_faq.md](docs/development_faq.md).
- Frontend: use [`frontend/lib/api/client.ts`](frontend/lib/api/client.ts) (`authenticatedFetch`), not raw `fetch` with hard-coded origins.

## Canonical examples

| Task | Reference |
|------|-----------|
| Document handler + unit tests | `backend/src/infrastructure/document/document_handler.rs` |
| Document router / DTOs | `backend/src/infrastructure/document/document_router.rs` |
| Integration tests | `backend/tests/documents_tests.rs` |
| React list + tests | `frontend/components/document-list.tsx`, `document-list.test.tsx` |
| Create form + tests | `frontend/components/document-create-form.tsx`, `document-create-form.test.tsx` |
| API client / auth | `frontend/lib/api/client.ts`, `frontend/contexts/AuthContext.tsx` |

## Best Practices

### Software design

- Apply **SOLID**, **KISS**, and **DRY**. Prefer clarity over cleverness; abstract only when duplication or boundaries justify it.
- Favor **encapsulation**, **modularity**, and **cohesion**. Keep modules focused; respect the backend layers described in **Architecture**.
- Structure code per **Clean Code**: functions should do one thing, stay at a single level of abstraction, and use names that reveal intent. Extract helpers when a function mixes orchestration with low-level detail.

### Testing (BDD / Gherkin)

- Add **BDD / Gherkin-style unit tests for new features whenever possible** — tests should describe behavior, not implementation details.
- Write scenarios in **Given / When / Then** form using clear test names, Arrange–Act–Assert layout, and/or `// Given`, `// When`, `// Then` comments.
- Reuse **Given\*** fixtures or setup helpers for shared context.

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

See **Test (match CI)** for commands; mirror naming from the closest existing tests.

## Before changing code

- Read surrounding modules and match naming, error handling, and module boundaries.
- Prefer **small, focused diffs**. Do not refactor unrelated code or add speculative abstractions.
- **Keep agent docs current:** when a change affects how agents should work in this repo, update [AGENTS.md](AGENTS.md) and any relevant nested files ([backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md), `.cursor/rules/*.mdc`) in the same change. Examples: new API routes or conventions, env vars, run/test commands, directory layout, CI steps, or operational constraints.
- **Do not edit** generated or build artifacts:
  - `backend/src/schema.rs` (regenerated when a human applies migrations)
  - `backend/rev.txt` (written by `./backend/scripts/write_rev.sh`)
  - `backend/target/`, `frontend/node_modules/`
- **Do not commit** secrets, `.env` files with credentials, or git-crypt key material.

## Definition of done

Before claiming work is complete:

- [ ] Respects **Architecture** layer boundaries (backend) and existing frontend layout
- [ ] **Best Practices**: BDD-style tests for new behavior where applicable
- [ ] Relevant tests run (see **Test (match CI)**)
- [ ] `npm run lint` if `frontend/` changed
- [ ] Optional locally: `cargo fmt --check` and `cargo clippy -D warnings` on backend
- [ ] No edits to generated artifacts
- [ ] [AGENTS.md](AGENTS.md) (and nested/stack rules) updated if the change affects agent workflows
- [ ] User told if they must apply migrations, change env files, or run git themselves

## Run locally

From the **repository root**:

```bash
# Full stack (backend + frontend) — profile: dev | test | prod
./build_and_start_app.sh dev

# Backend only (writes to DB at runtime — allowed; see Critical Rules)
cd backend && cargo run
```

- Env files: `backend/.dev.env`, `backend/.test.env`, `backend/.prod.env` — require **`APP_PORT`**, **`DATABASE_URL`** (and related vars per profile)
- Default API port: **`APP_PORT`** (usually **3000**)
- **dev**: backend via `cargo run` on host; frontend via Expo on host (**8080**)
- **prod**: UI and API in Docker; browsers use **`gateway`** (default port **80**)
- **test**: backend builds only; Compose stack is not started by the start scripts

Optional OCR: `TESSERACT_ENABLED=false` by default; `--with-tesseract` or Compose `--profile tesseract`. Ollama summarization is optional infrastructure.

Dev container: `backend/.container/` — see [README.md](README.md).

## Test (match CI)

Run the same checks as [`.github/workflows/main.yml`](.github/workflows/main.yml) before claiming work is done.

**Frontend unit tests** (Vitest):

```bash
cd frontend && npm ci && npm run test:run
```

**Backend unit tests**:

```bash
./backend/scripts/write_rev.sh
cargo test --lib --manifest-path backend/Cargo.toml
```

**Backend integration tests** (may use Docker via testcontainers — see `backend/tests/common/`):

```bash
./backend/scripts/write_rev.sh
cd backend && cargo test --test '*'
```

**Optional Rust checks** (toolchain installed in CI; not always run in workflow):

```bash
cargo fmt --manifest-path backend/Cargo.toml -- --check
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
```

Co-locate frontend tests next to components (`*.test.tsx`). Integration tests live in `backend/tests/`. New features: **Best Practices** (BDD / Gherkin).

**Ignored tests:** Some tests use `#[ignore]` (e.g. docker-compose integration in `documents_tests.rs`, Ollama adapter tests). CI runs `cargo test --test '*'` but **ignored tests do not run** unless explicitly invoked with `--ignored`. Do not assume they passed.

## Database (Diesel + SQLite)

See **Critical Rules** — agents must not apply migrations or run write SQL.

- **OK:** Create or edit SQL under `backend/migrations/`; read `backend/src/schema.rs` and migration history.
- **User-run only:** `diesel migration run`, `diesel setup`, regenerating `schema.rs` — see [README.md](README.md).
- Read-only CLI: `diesel migration list`, `diesel print-schema` (from `backend/` with `DATABASE_URL` set).
- Do not hand-edit `backend/src/schema.rs`.

## Docker / Compose

- Compose file: `docker-compose.yml` at repo root
- Profiles: `dev`, `prod`, `test`, optional `tesseract`
- Pass `--env-file backend/.<profile>.env` so ports and feature flags stay consistent

Details: [README.md](README.md) and [docs/development_faq.md](docs/development_faq.md).

Quick API health check:

```bash
curl -v --max-time 8 http://localhost:3000/api/health
```

## Git and PRs

Git is **read-only for agents** — see **Critical Rules**. Never run `git commit`, `git push`, or other state-changing git commands; the user handles all git operations.

- CI on `main`: frontend tests → backend unit tests → integration tests → ECR image → Lightsail deploy.
- Humans must never force-push to `main`.

## Nested agent instructions

Stack-specific guidance (applied when working in those directories):

- [backend/AGENTS.md](backend/AGENTS.md) — Rust layers, Diesel, handlers, tests
- [frontend/AGENTS.md](frontend/AGENTS.md) — Expo Router, Vitest, API config

File-scoped rules: `.cursor/rules/rust-backend.mdc`, `.cursor/rules/frontend-react.mdc`.

## When unsure

See **Do not assume** — ask the user; do not proceed on assumptions.

- Follow **Best Practices** and patterns in nearby `*.test.tsx` / `*_tests.rs` files.
- Use **Canonical examples** and **API conventions** above.
- Prefer extending existing use cases and handlers over new parallel patterns.
- Ask before large architectural or cross-cutting changes, and whenever requirements or acceptance criteria are not explicit.
