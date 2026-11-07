# API reference (agents)

Parent hub: [../../AGENTS.md](../../AGENTS.md). Routing diagrams: [../architecture.md](../architecture.md#http-routing).

## Endpoints

| Endpoint | Notes |
|----------|--------|
| `GET /api/health` | Returns `"up"` |
| `GET /api/version` | Build/git revision string |
| `POST /life-manager/api/v1/auth/login` | JWT login |
| `POST /life-manager/api/v1/auth/signup` | Create inactive user (email stored as `username`); returns pending-approval message; no JWT |
| `GET /life-manager/api/v1/auth/protected` | Auth smoke test |
| `POST /test-tenant/api/v1/auth/login` | JWT login (test-tenant pilot) |
| `POST /test-tenant/api/v1/auth/signup` | Create inactive user (test-tenant pilot) |
| `GET /test-tenant/api/v1/auth/protected` | Auth smoke test (test-tenant pilot) |
| `POST /life-manager/api/v1/documents/` | Multipart: `json` (CreateDocumentCommand) + `file` |
| `POST /life-manager/api/v1/documents/json` | JSON body: CreateDocumentCommand with required `storage` (Proton Drive ref); no file/OCR — see [Proton upload workflow](../development_faq.md#upload-workflow) |
| `GET /life-manager/api/v1/documents/{id}` | Single document (owner only; other users receive 404) |
| `DELETE /life-manager/api/v1/documents/{id}` | Hard-delete owned document (204); other users / missing → 404. Proton Drive trash is client-side before this call when `storage` exists — see [delete workflow](../development_faq.md#delete-workflow) |
| `GET /life-manager/api/v1/documents/` | List owned docs. `title` = keyset cursor (`title >` value). `title_contains` = case-insensitive substring on title. |
| `PUT /life-manager/api/v1/documents/json/{id}` | JSON body: UpdateDocumentCommand; optional `storage` replaces Proton ref; `storage: null` keeps existing |
| `PUT /life-manager/api/v1/documents/{id}` | Multipart: `json` (UpdateDocumentCommand) + optional `file` (OCR on native) |
| `POST /life-manager/api/v1/health-members` | JSON: CreateHealthMemberCommand (`display_name` required, trimmed, max 100; optional `birth_date` YYYY-MM-DD, not future; optional `notes` max 2000). Creates `active=true`. JWT. |
| `GET /life-manager/api/v1/health-members` | List owned HealthMembers. Query `include_inactive=true` to include deactivated (default false = active only). |
| `GET /life-manager/api/v1/health-members/{id}` | Single HealthMember (owner only; other users / missing → 404). Inactive still returned for owner. |
| `PUT /life-manager/api/v1/health-members/{id}` | JSON: UpdateHealthMemberCommand — `display_name` required. `birth_date` / `notes`: omit = keep, `null` = clear, value = set. Optional `active` for reactivate (`true`) or deactivate (`false`). Prefer POST deactivate for deactivate. Limits are Unicode characters (name max 100, notes max 2000). |
| `POST /life-manager/api/v1/health-members/{id}/deactivate` | Soft-deactivate (idempotent). Sets `active=false` and `deactivated_at`. Row remains; GET by id still works for owner. |
| `POST /life-manager/api/v1/health-readings` | JSON: CreateHealthReadingCommand (`health_member_id`, `recorded_on` YYYY-MM-DD required; optional metric vitals only — `height_cm`, `weight_kg`, `systolic_mm_hg`, `diastolic_mm_hg`, `heart_rate_bpm`, `notes`). At least one metric or notes. Duplicate `(health_member_id, recorded_on)` → 400. Inactive member → 400. Other user's member → 404. JWT. Response includes optional computed `bmi` (not stored). |
| `GET /life-manager/api/v1/health-readings` | List readings for one owned HealthMember. Query `health_member_id` required. Optional inclusive `from` / `to` (YYYY-MM-DD); `from` > `to` → 400. Newest `recorded_on` first. MVP returns all matching rows (unbounded). |
| `PUT /life-manager/api/v1/health-readings/{id}` | JSON: UpdateHealthReadingCommand — replace mutable metric fields (`recorded_on` required; optional vitals same as create). `health_member_id` is immutable. At least one metric or notes. Changing `recorded_on` onto another reading's date for that member → 400. Missing / other user's id → 404. JWT. |
| `DELETE /life-manager/api/v1/health-readings/{id}` | Hard-delete owned reading (204). Missing / other user's id → 404. Delete twice → second 404. JWT. |

**HealthMember ownership (for HealthReading / other aggregates):** store `HealthMemberId` only; enforce owner via `user_id`; reject new readings/visits on inactive members (`HealthMember::ensure_active_for_write`). Separate from Document.

Proton-backed file **preview, download, and trash** are client → Proton Drive only (web). There is no `GET .../documents/{id}/file` (or similar) on this API; see [Proton preview/download](../development_faq.md#preview-and-download-workflow) and [delete workflow](../development_faq.md#delete-workflow).

Ops endpoints stay at `/api/*`. The v1 product API is namespaced under `/life-manager/api/v1/*`.

### Router wiring

- `backend/src/lib.rs`: stateless `/api/health`, `/api/version`; `LifeManagerTenant::mount()` and `TestTenant::mount()` nest `/life-manager` and `/test-tenant` with per-tenant state
- `backend/libs/life-manager/src/life_manager_tenant.rs`: `LifeManagerTenant` implements `TenantMount`; `api_router()` nests `/api/v1` → `auth`, `documents`, `health-members`, `health-readings`
- `backend/libs/test-tenant/src/test_tenant.rs`: `TestTenant` implements `TenantMount`; `api_router()` nests `/api/v1` → `auth` only (pilot)
- `backend/libs/common/server-host/`: `AppBootstrap` (build-time only) and `TenantMount` trait

### Gateway (prod)

Nginx proxies each tenant hostname to its mount path (see `nginx/tenants.prod.json` and `nginx/generated/tenant-servers.conf.template`) plus `/api` (health/version) to the backend. See `nginx/README.md`.

## Auth

- Protected routes: `Authorization: Bearer <token>`
- Login rejects unknown credentials, inactive users (`active = false`), and principals whose `tenant` does not match the tenant mount (e.g. `life-manager`)
- Signup (`POST .../auth/signup`) accepts `{ email, password }`, stores the email in `auth_users.username`, inserts with `active = false`, and returns `201` with a pending-approval message (no JWT). Duplicate email → `400 validation_error`.

```mermaid
flowchart TD
  A[User submits /signup] --> B[POST .../auth/signup]
  B --> C[Validate email and password]
  C --> D[Hash password]
  D --> E["INSERT auth_users active=false"]
  E --> F[201 pending-approval message]
  F --> G[Admin activates via sqlite3]
  G --> H[Login succeeds]
```

- **Manual activation:** after signup, an admin activates the account in SQLite (agents do not run write SQL):

```bash
# Dev DB path from .dev.env
sqlite3 ./data/dev-test.db \
  "UPDATE auth_users SET active = 1 WHERE username = 'user@example.com';"
```

List pending signups:

```sql
SELECT username, tenant, created_at FROM auth_users WHERE active = 0;
```

- Backend auth crate: `backend/libs/auth/` builds `AuthState` via `AuthStateBuilder`; life-manager composes it into `LifeManagerState` and wires `FromRef` via `libs/life-manager/src/infrastructure/auth_integration.rs`
- Handlers receive `AuthUser` where required
- Frontend: `useAuth()` + `authenticatedFetch` from `frontend/lib/api/client.ts` — do not hard-code origins in components

## Multipart document create

See [../development_faq.md](../development_faq.md) for Postman/examples.

## Frontend API base URL

Override order (`frontend/constants/config.ts`, `app.config.ts`):

1. `EXPO_PUBLIC_API_BASE_URL`
2. Expo `extra.apiUrl`

- **Dev:** usually `http://localhost:3000` (or host reachable from device/emulator)
- **Prod:** same origin as **gateway** — see [../../README.md](../../README.md)

### Frontend path convention

Import `apiV1` from `@/lib/api/client`. Example: `apiV1('/documents')` — do not hard-code `/api/v1` or `/life-manager` in components. The v1 prefix is set at runtime from the active tenant (`TenantProvider` → `configureApiClient`).

**Tenant resolution (frontend):** hostname or env maps to a tenant module in `frontend/lib/tenant/registry.ts`, which supplies `apiV1Prefix` (e.g. `/life-manager/api/v1`). This is separate from nginx routing but must stay aligned with backend `TenantMount::MOUNT_PATH`. Dev options: [../development_faq.md](../development_faq.md#multi-tenant-frontend-dev).

Device/emulator notes: [../development_faq.md](../development_faq.md).

### TypeScript DTOs

Request/response types for the v1 API are generated from Rust (`ts-rs`) into `frontend/lib/api/generated/`. Import via `@/lib/api/types`. Regenerate with `./backend/scripts/export_ts_bindings.sh` when backend DTOs change.
