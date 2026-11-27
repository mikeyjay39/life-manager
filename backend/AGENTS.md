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
      src/domain/           # By aggregate: car/, document/, health/
      src/application/      # By aggregate: car/, document/, health/
      src/infrastructure/ # By aggregate: car/, document/, health/ + shared/
      src/schema.rs       # Generated — do not hand-edit
      migrations/         # Author SQL here; user runs diesel migration run
    test-tenant/
      src/test_tenant.rs  # TestTenant (TenantMount impl, auth-only pilot)
      src/infrastructure/ # TestTenantState, own DB pool (TEST_TENANT_DATABASE_URL)
  tests/                  # Integration tests
```

Rust **edition 2024** (`Cargo.toml`).

## Workspace crates

| Crate | Role |
|-------|------|
| **`mikeyjay-server`** | HTTP server binary; stateless top-level routes; mounts tenant routers |
| **`server-host`** | `AppBootstrap` + `TenantMount` trait (build-time composition, not Axum state) |
| **`backend-utils`** | Shared HTTP helpers (`AppError` / `AppResult`) and value objects such as `EmailAddress` (`libs/common/backend-utils`) |
| **`auth`** | Shared authentication (`libs/auth/`); `EmailSender` port with log / capture / Resend adapters via `EMAIL_PROVIDER`. Test helpers: feature `test-support` (or `cfg(test)`); do not enable on the prod binary dep |
| **`life-manager`** | Primary tenant crate: domain logic, Diesel/SQLite, Document + Health + Car APIs |
| **`test-tenant`** | Second tenant (pilot): auth-only API; own SQLite pool via `TEST_TENANT_DATABASE_URL` |

`mikeyjay-server` depends on `server-host` + `life-manager` + `test-tenant`. New product tenants implement `TenantMount` in their own crate; shared auth stays in `auth`.

**Naming:** Cargo package `mikeyjay-server`, library crate `life-manager`, binary artifact `life-manager` (see `[[bin]]` in root `Cargo.toml`).

## Layer rules

Applies within **`libs/life-manager/src/`**:

| Layer | May import |
|-------|------------|
| `domain` | `domain` only |
| `application` | `domain`, `application` |
| `infrastructure` | any layer |

New features: `domain` / `application` first, then `infrastructure/<aggregate>/` (see `infrastructure/document/`). Platform adapters (DB pool, HTTP client, `app_state`) live under `infrastructure/shared/`.

In-memory `<Aggregate>Collection` repositories (for example `CarCollection`, `DocumentCollection`) are test fakes of the repository port. Define each one in a `#[cfg(test)] pub(crate) mod tests` at the end of its port file, `application/<aggregate>/<aggregate>_repository.rs`. Tests in any layer import it from there, for example `crate::application::car::car_repository::tests::CarCollection`. Do not put them in their own module files or in product code. Product code uses the `*OrmCollection` adapters.

Domain, application, and infrastructure feature modules live under flat aggregate folders (`…/car`, `…/document`, `…/health`). Import as `crate::<layer>::<aggregate>::<module>::…` (for example `crate::domain::health::health_member::HealthMember`, `crate::application::car::create_car_command::CreateCarCommand`, `crate::infrastructure::health::health_member_handler::…`). The car and document domain aggregate roots re-export their primary types at `crate::domain::car::…` and `crate::domain::document::…`.

## Auth email (port)

- Domain port: `EmailSender` + `EmailMessage` in `libs/auth/src/domain/`
- `EmailMessage.to` is `backend_utils::EmailAddress` (parse once at the use-case boundary)
- Adapters in `libs/auth/src/infrastructure/`: `LogOnlyEmailSender` (default; body redacted in logs), `CaptureFileEmailSender` (`EMAIL_PROVIDER=capture` or `file`; full body on disk for e2e), `ResendEmailSender`
- Env (no hard-coded domain): `EMAIL_PROVIDER` (`log` \| `capture` \| `file` \| `resend`, default `log`), `EMAIL_CAPTURE_DIR` (required for capture), `RESEND_API_KEY`, `EMAIL_FROM`, `APP_PUBLIC_BASE_URL`
- `AuthStateBuilder` loads config and stores `email_sender` + `app_public_base_url` on `AuthState`
- Do not log `RESEND_API_KEY`; log adapter redacts body content; capture writes full bodies under `EMAIL_CAPTURE_DIR` (do not commit)
- `EmailProvider::Resend { api_key, email_from }` holds Resend credentials (non-optional on that variant)
- `EmailProvider::Capture { capture_dir }` holds the capture sink path

## API wiring

- `backend/src/lib.rs`: stateless `/api/health`, `/api/version`; nest tenants via `TenantMount::mount`
- `backend/libs/life-manager/src/life_manager_tenant.rs`: `LifeManagerTenant` implements `TenantMount`; builds `LifeManagerState` (own DB pool) and calls `.with_state()` on the nested router
- `backend/libs/life-manager/src/life_manager_tenant.rs` → `api_router()`: nest `/api/v1` → `auth`, `documents`, `health-members`, `health-readings`, `doctor-visits`, `cars`, `car-maintenance-events`
- Public v1 paths: `/life-manager/api/v1/...` — see [../docs/agents/api.md](../docs/agents/api.md)
- Per feature: `*_router.rs`, `*_handler.rs`, `*_state.rs` (handler state via `FromRef<LifeManagerState>`)
- Health API: metric vitals only; no imperial request fields. Ownership: auth `user_id` on `HealthMember`; readings/visits reference `HealthMemberId`.
- Car API: auth `user_id` on `Car`; events reference `CarId`. Optional Document links are UUID refs only (owned Documents). Hard-delete of a Car cascades events.
- Cross-aggregate writes: when one request must write two aggregates atomically (for example a Car and its new Documents), add a write-only **use-case port** in `application/<aggregate>/` (`CarDocumentsWriter`, `CarMaintenanceEventDocumentsWriter`) with a Diesel adapter that runs one transaction. Do not make one repository write another aggregate. Share connection-level SQL functions (`insert_document_with_tags`, `insert_car`, `update_car`, `insert_maintenance_event`, `update_maintenance_event`) between the repository and the adapter. SQLite adapter tests use `infrastructure/shared/sqlite_test_support.rs`.

## Document extraction (ports)

- Domain ports in `domain/document/`: `DocumentExtractor` (`document_extractor.rs`) and `PdfReader` (`pdf_reader.rs`). Test fakes (`FakeDocumentExtractor`, `FakePdfReader`) are at the end of each port file.
- Use case: `application/document/extract_document_fields_command.rs` (validate → prepare source → reserve unit → extract → normalize). `ExtractionMediaType::detect` uses magic numbers.
- Adapters in `infrastructure/shared/`: `GeminiDocumentExtractorAdapter` + `GeminiConfig` (`gemini_document_extractor_adapter.rs`) and `LopdfPdfReader` (`pdf_reader_adapter.rs`). PDF work runs in `spawn_blocking`.
- `HttpClient::post_json` (`http_client.rs`) is the outbound HTTP port. Request headers can hold API keys: do not log them.
- Env: `GEMINI_API_KEY` (unset → `document_extractor: None` → 503), `GEMINI_MODEL`, `GEMINI_API_BASE_URL`. Integration tests point the base URL at a wiremock server (`tests/document_extract_tests.rs`).
- Logs: one line for each request with user_id, media type, size, page count, path, latency, and status. Never log the extracted text, the file bytes, or the key.
- Limits live in the database, not in env or code: `document_extraction_limits` (one row, read on each request). Per-user daily usage is in `document_extraction_usage`. Only the owner changes the limits ([../docs/development_faq.md](../docs/development_faq.md#change-document-extraction-limits-owner-only)).
- Workflow sequence and the Proton privacy note: [../docs/development_faq.md](../docs/development_faq.md#extract-from-file-workflow).

## TypeScript DTO codegen (ts-rs)

Rust is the source of truth for **HTTP contract types** (request/response DTOs). Annotate those structs with `#[derive(TS)]` and `#[ts(export, export_to = "...")]`, then export via `export_typescript_bindings` tests.

| Crate | Annotated types | Output |
|-------|-----------------|--------|
| `auth` | `LoginRequest`, `LoginResponse` in `domain/login_request.rs`; `SignupRequest`, `SignupResponse` in `domain/signup_request.rs`; `VerifyEmailRequest`, `VerifyEmailResponse` in `domain/verify_email_request.rs`; `PasswordResetRequestRequest`, `PasswordResetRequestResponse`, `PasswordResetConfirmRequest`, `PasswordResetConfirmResponse` in `domain/password_reset_request.rs` | `frontend/lib/api/generated/auth/` |
| `life-manager` | Document DTOs in `infrastructure/document/`; HealthMember / HealthReading / DoctorVisit DTOs in `infrastructure/health/`; Car / CarMaintenanceEvent DTOs in `infrastructure/car/` | `frontend/lib/api/generated/life-manager/` |

**Do not** export domain aggregates (e.g. `Document` with `user_id`) or server-only types (e.g. JWT `Claims`).

Regenerate and commit TypeScript after changing API structs:

```bash
./backend/scripts/export_ts_bindings.sh
```

CI runs the same export tests and fails if `frontend/lib/api/generated/` is stale.

## Diesel / SQLite

- Bundled SQLite (`libsqlite3-sys`); `DATABASE_URL` (life-manager) and `TEST_TENANT_DATABASE_URL` (test-tenant pilot) from `.<profile>.env` at the repo root
- Agents: edit `libs/life-manager/migrations/*.sql` and `libs/auth/migrations/*.sql` only — never `diesel migration run` or hand-edit `libs/life-manager/src/schema.rs` or `libs/auth/src/schema.rs`
- User applies migrations per [../README.md](../README.md)
- `document_extraction_limits` and `document_extraction_usage` have no `schema.rs` entry. Their adapter (`infrastructure/document/document_extraction_orm_collection.rs`) uses `diesel::sql_query` with `QueryableByName` rows. The daily reserve is one atomic `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING count` statement.
- `create_connection_pool_from_url` sets `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000` on each pooled connection. Concurrent writers wait for the lock instead of failing with `SQLITE_BUSY`.

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
| HealthMember handler + diagram | `libs/life-manager/src/infrastructure/health/health_member_handler.rs` |
| HealthMember router | `libs/life-manager/src/infrastructure/health/health_member_router.rs` |
| HealthMember integration | `tests/health_members_tests.rs` |
| HealthReading handler + diagram | `libs/life-manager/src/infrastructure/health/health_reading_handler.rs` |
| HealthReading router | `libs/life-manager/src/infrastructure/health/health_reading_router.rs` |
| HealthReading integration | `tests/health_readings_tests.rs` |
| DoctorVisit handler + diagram | `libs/life-manager/src/infrastructure/health/doctor_visit_handler.rs` |
| DoctorVisit router | `libs/life-manager/src/infrastructure/health/doctor_visit_router.rs` |
| DoctorVisit integration | `tests/doctor_visits_tests.rs` |
| Car handler + diagram | `libs/life-manager/src/infrastructure/car/car_handler.rs` |
| Car router | `libs/life-manager/src/infrastructure/car/car_router.rs` |
| Car integration | `tests/cars_tests.rs` |
| CarMaintenanceEvent handler + diagram | `libs/life-manager/src/infrastructure/car/car_maintenance_event_handler.rs` |
| CarMaintenanceEvent router | `libs/life-manager/src/infrastructure/car/car_maintenance_event_router.rs` |
| CarMaintenanceEvent integration | `tests/car_maintenance_events_tests.rs` |
| Multitenancy pilot | `tests/test_tenant_auth_tests.rs`, `libs/test-tenant/` |
| Auth email tokens (issue / find_valid / consume; hash only) | `libs/auth/src/domain/email_token_service.rs`, `libs/auth/src/infrastructure/email_token_orm_collection.rs`, migration `libs/auth/migrations/2026-11-10-000000_create_auth_email_tokens/` |
