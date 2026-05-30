# Backend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when backend conventions change.

## Layout

```
backend/src/
  domain/           # Entities, traits
  application/      # Use cases, commands, repository traits
  infrastructure/   # HTTP, Diesel, adapters (auth, document, tesseract, ollama)
  schema.rs         # Generated — do not hand-edit
backend/migrations/ # Author SQL here; user runs diesel migration run
backend/tests/      # Integration tests
```

Rust **edition 2024** (`Cargo.toml`).

## Layer rules

| Layer | May import |
|-------|------------|
| `domain` | `domain` only |
| `application` | `domain`, `application` |
| `infrastructure` | any layer |

New features: `domain` / `application` first, then `infrastructure/<feature>/` (see `infrastructure/document/`).

## API wiring

- `lib.rs`: `/api/health`, `/api/version`, nest `/api/v1` → `auth`, `documents`
- Per feature: `*_router.rs`, `*_handler.rs`, `*_state.rs`
- Endpoints table: [../docs/agents/api.md](../docs/agents/api.md)

## Diesel / SQLite

- Bundled SQLite (`libsqlite3-sys`); `DATABASE_URL` from `backend/.<profile>.env`
- Agents: edit `migrations/*.sql` only — never `diesel migration run` or hand-edit `schema.rs`
- User applies migrations per [../README.md](../README.md)

## Tests

- **Unit:** `#[cfg(test)]` in modules — `Given*` fixtures, `#[tokio::test]`, BDD-style names ([../docs/agents/testing.md](../docs/agents/testing.md))
- **Integration:** `tests/*_tests.rs` — `serial_test::serial`, `traced_test`, testcontainers (`tests/common/`)
- Always `./backend/scripts/write_rev.sh` before backend test runs (see testing doc for commands)

## Examples

| Task | File |
|------|------|
| Handler + unit tests + ASCII sequence diagram | `src/infrastructure/document/document_handler.rs` (`create_document` doc comment — see hub **Definition of done**) |
| Router | `src/infrastructure/document/document_router.rs` |
| Integration | `tests/documents_tests.rs` |
