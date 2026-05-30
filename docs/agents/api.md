# API reference (agents)

Parent hub: [../../AGENTS.md](../../AGENTS.md). Routing diagrams: [../architecture.md](../architecture.md#http-routing).

## Endpoints

| Endpoint | Notes |
|----------|--------|
| `GET /api/health` | Returns `"up"` |
| `GET /api/version` | Build/git revision string |
| `POST /life-manager/api/v1/auth/login` | JWT login |
| `GET /life-manager/api/v1/auth/protected` | Auth smoke test |
| `POST /life-manager/api/v1/documents/` | Multipart: `json` (CreateDocumentCommand) + `file` |
| `GET /life-manager/api/v1/documents/{id}` | Single document |
| `GET /life-manager/api/v1/documents/` | Query by title |

Ops endpoints stay at `/api/*`. The v1 product API is namespaced under `/life-manager/api/v1/*`.

### Router wiring

- `backend/src/lib.rs`: nest `/life-manager` → `life_manager_api_router()`
- `backend/libs/life-manager/src/lib.rs`: nest `/api/v1` → `auth`, `documents`

### Gateway (prod)

Nginx proxies `/life-manager/api` (v1 API) and `/api` (health/version) separately to the backend. See `nginx/templates/default.conf.template`.

## Auth

- Protected routes: `Authorization: Bearer <token>`
- Backend auth crate: `backend/libs/auth/`; life-manager wires it via `libs/life-manager/src/infrastructure/auth_integration.rs`
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

Import `API_V1_PREFIX` from `@/constants/config` (`/life-manager/api/v1`). Build API paths as `` `${API_V1_PREFIX}/documents` `` — do not hard-code `/api/v1` in components.

Device/emulator notes: [../development_faq.md](../development_faq.md).
