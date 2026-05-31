# Frontend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API / URLs: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when frontend conventions change.

## Layout

| Path | Role |
|------|------|
| `app/` | Expo Router (`(tabs)/`, `login.tsx`, `_layout.tsx`) |
| `components/` | UI; co-locate `*.test.tsx` |
| `contexts/` | `AuthContext` (token, login, logout) |
| `lib/api/` | `client.ts` — `apiFetch`, `authenticatedFetch`, `apiV1` |
| `constants/` | `config.ts` — `API_BASE_URL`, `API_V1_PREFIX` |

Use `@/` path alias (`tsconfig.json`).

## API and auth

- Base URL and device notes: [../docs/agents/api.md](../docs/agents/api.md)
- `API_BASE_URL` — server origin (e.g. `http://localhost:3000` in dev, empty for same-origin prod)
- `API_V1_PREFIX` — `/life-manager/api/v1`; build paths with `apiV1('/documents')` from `@/lib/api/client` (see `components/document-list.tsx`)
- Do not hard-code `/api/v1` in components — use `apiV1`
- `authenticatedFetch` from `@/lib/api/client` — not raw `fetch` with hard-coded hosts
- `useAuth()` from `@/contexts/AuthContext`; 401/403 → `handleUnauthorized`

## Tests

- Vitest + Testing Library; mock `AuthContext` and `@/lib/api/client` (see existing `*.test.tsx`)
- BDD-style names and Given/When/Then comments: [../docs/agents/testing.md](../docs/agents/testing.md)

```bash
cd frontend && npm ci && npm run test:run
npm run lint
```

## Workflow diagrams

Multi-step UI flows (auth → fetch → render, wizards, etc.) follow the hub [**Definition of done**](../AGENTS.md#definition-of-done): add an ASCII UML sequence or activity diagram as a comment on the orchestrating component or hook. Canonical backend example: [`document_handler.rs`](../backend/libs/life-manager/src/infrastructure/document/document_handler.rs) (`create_document`).

## Examples

| Task | Files |
|------|--------|
| List + tests | `components/document-list.tsx`, `document-list.test.tsx` |
| Form + tests | `components/document-create-form.tsx`, `document-create-form.test.tsx` |
| API client | `lib/api/client.ts` |
