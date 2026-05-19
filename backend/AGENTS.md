# Backend — agent instructions

Parent: [../AGENTS.md](../AGENTS.md). **Critical Rules** (git read-only, DB read-only for agents) and **Do not assume** (ask when unsure) apply here. Update this file and [../AGENTS.md](../AGENTS.md) when backend workflow or conventions change.

## Layout

```
backend/src/
  domain/           # Entities, traits — no application/infrastructure imports
  application/      # Use cases, commands, repository traits
  infrastructure/   # HTTP, Diesel, adapters (auth, document, tesseract, ollama)
  schema.rs         # Generated — do not hand-edit
backend/migrations/ # SQL migrations — OK to author; user runs diesel migration run
backend/tests/      # Integration tests (testcontainers, serial_test)
```

## Layer rules

| Layer | May import |
|-------|------------|
| `domain` | `domain` only |
| `application` | `domain`, `application` |
| `infrastructure` | any layer |

New features: extend `domain` / `application` first, then add handlers/ORM in `infrastructure/<feature>/`.

## API wiring

- App router: `lib.rs` — nests `/api/v1` → `auth`, `documents`
- Per-feature: `*_router.rs`, `*_handler.rs`, `*_state.rs`
- Auth: JWT via `infrastructure/auth/`; handlers receive `AuthUser` where required

## Diesel / SQLite

- Edition 2024, SQLite with bundled `libsqlite3-sys`
- Agents: author `migrations/*.sql` only; never run `diesel migration run`
- `DATABASE_URL` from env (e.g. `backend/.dev.env`)

## Tests

- **Unit:** `#[cfg(test)]` in modules (e.g. `document_handler.rs`) — `Given*` fixtures, `#[tokio::test]`
- **Integration:** `backend/tests/*_tests.rs` — `serial_test::serial`, `traced_test`, testcontainers in `tests/common/`
- Run: `./scripts/write_rev.sh` from repo root, then `cargo test --lib` / `cargo test --test '*'`
- `#[ignore]` tests (docker-compose full stack, live Ollama) are skipped in normal CI

## Optional quality

```bash
cargo fmt --manifest-path backend/Cargo.toml -- --check
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
```

## Examples

- Handler + BDD-style unit tests: `src/infrastructure/document/document_handler.rs`
- Integration: `tests/documents_tests.rs`
