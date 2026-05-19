# life-manager — agent instructions

Personal/family life-management app. **Documents** are implemented today; medical, location, car, and receipt managers are planned (see [README.md](README.md)).

Monorepo layout:

| Path | Stack |
|------|--------|
| `backend/` | Rust (Axum, Diesel/SQLite, Tokio) |
| `frontend/` | Expo / React Native (expo-router, Vitest) |
| Root | `docker-compose.yml`, `build_and_start_app.sh` |

## Critical Rules

These rules override other sections in this file. Violating them is never acceptable.

### Git (read-only)

Do **not** run any git command that changes repository state, remotes, or history.

**Never run:** `git add`, `git commit`, `git push`, `git pull`, `git merge`, `git rebase`, `git cherry-pick`, `git revert`, `git reset`, `git checkout`, `git switch`, `git restore`, `git clean`, `git stash`, `git rm`, `git mv`, `git tag`, `git branch` (delete/rename), `git push --force`, `git config` (set/unset).

**OK for inspection:** `git status`, `git diff`, `git log`, `git show`, `git branch` (list), `git rev-parse`, `git describe`.

### Database (read-only)

Do **not** run any non-read query or command against any database (dev, test, prod, or ad-hoc SQLite files).

**Never run:** `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `REPLACE`, or equivalents; `diesel migration run`, `diesel database reset`, or other Diesel/CLI commands that apply or revert migrations; manual `sqlite3` (or other clients) with write statements.

**OK:** `SELECT` and read-only schema inspection; reading migration/SQL files; `diesel migration list` / `diesel print-schema`.

**Exception:** `cargo test` when verifying work — tests use isolated DB setup in `backend/tests/`; do not run separate manual write commands.

## Architecture (backend)

Follow the existing layered layout under `backend/src/`:

- **`domain/`** — entities, value objects, domain traits (no infrastructure imports).
  - Cannot import from `application/` or `infrastructure/`.
- **`application/`** — use cases, commands/queries, repository traits.
  - Can import from `domain/` but not `infrastructure/`.
- **`infrastructure/`** — HTTP handlers, Diesel ORM, adapters (Tesseract, Ollama, JWT auth).
  - Can import from any layer.

Add features by extending domain/application first, then wiring infrastructure. Match patterns in nearby modules (e.g. `infrastructure/document/` for document APIs).

## Best Practices

### Software design

- Apply **SOLID**, **KISS**, and **DRY**. Prefer clarity over cleverness; abstract only when duplication or boundaries justify it.
- Favor **encapsulation**, **modularity**, and **cohesion**. Keep modules focused; respect the backend layers described in **Architecture**.
- Structure code per **Clean Code**: functions should do one thing, stay at a single level of abstraction, and use names that reveal intent. Extract helpers when a function mixes orchestration with low-level detail.

### Testing (BDD / Gherkin)

- Add **BDD / Gherkin-style unit tests for new features whenever possible** — tests should describe behavior, not implementation details.
- Write scenarios in **Given / When / Then** form using clear test names, Arrange–Act–Assert layout, and/or `// Given`, `// When`, `// Then` comments.
- Reuse **Given\*** fixtures or setup helpers for shared context (see `document_handler.rs` unit tests and co-located `*.test.tsx` files).
- See **Test (match CI)** for commands; mirror naming and structure from the closest existing tests in the same area.

## Before changing code

- Read surrounding modules and match naming, error handling, and module boundaries.
- Prefer **small, focused diffs**. Do not refactor unrelated code or add speculative abstractions.
- **Do not edit** generated or build artifacts:
  - `backend/src/schema.rs` (Diesel schema — regenerated when a human applies migrations; see [README.md](README.md))
  - `backend/rev.txt` (written by `./backend/scripts/write_rev.sh`)
  - `backend/target/`, `frontend/node_modules/`
- **Do not commit** secrets, `.env` files with credentials, or git-crypt key material. Some env files are encrypted; see [docs/development_faq.md](docs/development_faq.md).

## Run locally

From the **repository root**:

```bash
# Full stack (backend + frontend) — profile: dev | test | prod
./build_and_start_app.sh dev

# Backend only
cd backend && cargo run
```

- Env files: `backend/.dev.env`, `backend/.test.env`, `backend/.prod.env`
- Default API port: **`APP_PORT`** (usually **3000**)
- **dev**: backend via `cargo run` on host; frontend via Expo on host (**8080**)
- **prod**: UI and API in Docker; browsers use **`gateway`** (default port **80**), not host Expo
- **test**: backend builds only; Compose stack is not started by the start scripts

Optional OCR sidecar: `TESSERACT_ENABLED=false` by default. Use `--with-tesseract` on `start_backend.sh` or Compose `--profile tesseract` when OCR is needed.

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

Co-locate frontend tests next to components (`*.test.tsx`). Integration tests live in `backend/tests/`. New feature work should follow **Best Practices** (BDD / Gherkin-style unit tests).

## Database (Diesel + SQLite)

See **Critical Rules** — agents must not apply migrations or run write SQL.

- Read migration files under `backend/migrations/` and `backend/src/schema.rs` for schema understanding.
- Read-only CLI: `diesel migration list`, `diesel print-schema` (from `backend/` with `DATABASE_URL` set).
- Applying migrations (`diesel migration run`, `diesel setup`, etc.) is **user-run** only — see [README.md](README.md).
- Do not hand-edit `backend/src/schema.rs`.

## Docker / Compose

- Compose file: `docker-compose.yml` at repo root
- Profiles: `dev`, `prod`, `test`, optional `tesseract`
- Pass `--env-file backend/.<profile>.env` so ports and feature flags stay consistent

Details: [README.md](README.md) (profiles, ports, gateway routing) and [docs/development_faq.md](docs/development_faq.md) (API URL, Android `adb reverse`, health check).

Quick API health check:

```bash
curl -v --max-time 8 http://localhost:3000/api/health
```

## Frontend notes

- Expo Router entry: `frontend/` (`expo-router`)
- API base URL: `EXPO_PUBLIC_API_BASE_URL` or Expo `extra.apiUrl` — must match how the backend is reached (localhost in dev, gateway origin in prod)
- Lint: `cd frontend && npm run lint`

## Git and PRs

Git is **read-only** for agents — see **Critical Rules**. Do not run `git commit`, `git push`, `git merge`, or any other state-changing git command.

- CI on `main` runs frontend tests, backend unit tests, integration tests, then deploys the backend image to AWS (Lightsail prod).
- If a human later runs git with explicit approval, never force-push to `main`.

## Docs to read first

| Doc | Use for |
|-----|---------|
| [README.md](README.md) | Run profiles, ports, Diesel setup, domain diagram |
| [docs/development_faq.md](docs/development_faq.md) | Postman multipart uploads, tests, git-crypt, local HTTP |
| [docs/todos.md](docs/todos.md) | Planned features |
| [frontend/README.md](frontend/README.md) | Frontend-specific setup |

## When unsure

- Follow **Best Practices** and existing test patterns in nearby `*.test.tsx` / `*_tests.rs` files.
- Inspect `backend/tests/*_tests.rs` for expected API behavior.
- Prefer extending existing use cases and handlers over new parallel patterns.
- Ask before large architectural or cross-cutting changes.
