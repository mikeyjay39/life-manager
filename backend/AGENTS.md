# Backend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when backend conventions change.

## Layout

```
backend/
  src/                    # mikeyjay-server binary (lib.rs, main.rs, build_info)
  libs/
    common/
      server-host/        # AppBootstrap, TenantMount trait (composition only)
    auth/                 # JWT login, auth_router
      src/schema.rs       # Generated — do not hand-edit
      migrations/         # Author SQL here; user runs diesel migration run
    life-manager/
      src/life_manager_tenant.rs  # LifeManagerTenant (TenantMount impl)
      src/domain/
      src/application/
      src/infrastructure/ # HTTP handlers, Diesel, adapters
      src/schema.rs       # Generated — do not hand-edit
      migrations/         # Author SQL here; user runs diesel migration run
  tests/                  # Integration tests
```

Rust **edition 2024** (`Cargo.toml`).

## Workspace crates

| Crate | Role |
|-------|------|
| **`mikeyjay-server`** | HTTP server binary; stateless top-level routes; mounts tenant routers |
| **`server-host`** | `AppBootstrap` + `TenantMount` trait (build-time composition, not Axum state) |
| **`auth`** | Shared authentication (`libs/auth/`) |
| **`life-manager`** | First tenant crate: domain logic, Diesel/SQLite, document API |

`mikeyjay-server` depends on `server-host` + `life-manager`. New product tenants implement `TenantMount` in their own crate; shared auth stays in `auth`.

**Naming:** Cargo package `mikeyjay-server`, library crate `life-manager`, binary artifact `life-manager` (see `[[bin]]` in root `Cargo.toml`).

## Layer rules

Applies within **`libs/life-manager/src/`**:

| Layer | May import |
|-------|------------|
| `domain` | `domain` only |
| `application` | `domain`, `application` |
| `infrastructure` | any layer |

New features: `domain` / `application` first, then `infrastructure/<feature>/` (see `infrastructure/document/`).

## API wiring

- `backend/src/lib.rs`: stateless `/api/health`, `/api/version`; nest tenants via `TenantMount::mount`
- `backend/libs/life-manager/src/life_manager_tenant.rs`: `LifeManagerTenant` implements `TenantMount`; builds `LifeManagerState` (own DB pool) and calls `.with_state()` on the nested router
- `backend/libs/life-manager/src/life_manager_tenant.rs` → `api_router()`: nest `/api/v1` → `auth`, `documents`
- Public v1 paths: `/life-manager/api/v1/...` — see [../docs/agents/api.md](../docs/agents/api.md)
- Per feature: `*_router.rs`, `*_handler.rs`, `*_state.rs` (handler state via `FromRef<LifeManagerState>`)

## Diesel / SQLite

- Bundled SQLite (`libsqlite3-sys`); `DATABASE_URL` from `.<profile>.env` at the repo root
- Agents: edit `libs/life-manager/migrations/*.sql` and `libs/auth/migrations/*.sql` only — never `diesel migration run` or hand-edit `libs/life-manager/src/schema.rs` or `libs/auth/src/schema.rs`
- User applies migrations per [../README.md](../README.md)

## Tests

- **Unit:** `#[cfg(test)]` in modules — `Given*` fixtures, `#[tokio::test]`, BDD-style names ([../docs/agents/testing.md](../docs/agents/testing.md))
- **Integration:** `tests/*_tests.rs` — `serial_test::serial`, `traced_test`, testcontainers (`tests/common/`)
- Always `./backend/scripts/write_rev.sh` before backend test runs (see testing doc for commands)

## Examples

| Task | File |
|------|------|
| Handler + unit tests + ASCII sequence diagram | `libs/life-manager/src/infrastructure/document/document_handler.rs` (`create_document` doc comment — see hub **Definition of done**) |
| Router | `libs/life-manager/src/infrastructure/document/document_router.rs` |
| Integration | `tests/documents_tests.rs` |
