# API reference (agents)

Parent hub: [../../AGENTS.md](../../AGENTS.md).

## Endpoints

| Endpoint | Notes |
|----------|--------|
| `GET /api/health` | Returns `"up"` |
| `GET /api/version` | Build/git revision string |
| `POST /api/v1/auth/login` | JWT login |
| `GET /api/v1/auth/protected` | Auth smoke test |
| `POST /api/v1/documents/` | Multipart: `json` (CreateDocumentCommand) + `file` |
| `GET /api/v1/documents/{id}` | Single document |
| `GET /api/v1/documents/` | Query by title |

Router wiring: `backend/src/lib.rs` nests `/api/v1` → `auth`, `documents`.

## Auth

- Protected routes: `Authorization: Bearer <token>`
- Backend: `infrastructure/auth/`, handlers receive `AuthUser` where required
- Frontend: `useAuth()` + `authenticatedFetch` from `frontend/lib/api/client.ts` — do not hard-code origins in components

## Multipart document create

See [../development_faq.md](../development_faq.md) for Postman/examples.

## Frontend API base URL

Override order (`frontend/constants/config.ts`, `app.config.ts`):

1. `EXPO_PUBLIC_API_BASE_URL`
2. Expo `extra.apiUrl`

- **Dev:** usually `http://localhost:3000` (or host reachable from device/emulator)
- **Prod:** same origin as **gateway** — see [../../README.md](../../README.md)

Device/emulator notes: [../development_faq.md](../development_faq.md).
