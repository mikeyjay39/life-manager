# Frontend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API / URLs: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when frontend conventions change.

## Layout

| Path | Role |
|------|------|
| `app/` | Expo Router (`(tabs)/`, `login.tsx`, `_layout.tsx`) |
| `components/` | UI; co-locate `*.test.tsx` |
| `contexts/` | `AuthContext` (token, login, logout) |
| `lib/api/` | `client.ts` — `apiFetch`, `authenticatedFetch` |
| `constants/` | `config.ts` — `API_BASE_URL` |

Use `@/` path alias (`tsconfig.json`).

## API and auth

- Base URL and device notes: [../docs/agents/api.md](../docs/agents/api.md)
- `authenticatedFetch` from `@/lib/api/client` — not raw `fetch` with hard-coded hosts
- `useAuth()` from `@/contexts/AuthContext`; 401/403 → `handleUnauthorized`

## Tests

- Vitest + Testing Library; mock `AuthContext` and `@/lib/api/client` (see existing `*.test.tsx`)
- BDD-style names and Given/When/Then comments: [../docs/agents/testing.md](../docs/agents/testing.md)

```bash
cd frontend && npm ci && npm run test:run
npm run lint
```

## Examples

| Task | Files |
|------|--------|
| List + tests | `components/document-list.tsx`, `document-list.test.tsx` |
| Form + tests | `components/document-create-form.tsx`, `document-create-form.test.tsx` |
| API client | `lib/api/client.ts` |
