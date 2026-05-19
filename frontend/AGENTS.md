# Frontend — agent instructions

Parent: [../AGENTS.md](../AGENTS.md). **Critical Rules** apply (agents do not run git or manual DB writes). **Do not assume** — ask when unsure. Update this file and [../AGENTS.md](../AGENTS.md) when frontend workflow or conventions change.

## Layout

| Path | Role |
|------|------|
| `app/` | Expo Router — file-based routes (`(tabs)/`, `login.tsx`, `_layout.tsx`) |
| `components/` | UI components; co-locate `ComponentName.test.tsx` |
| `contexts/` | React context (`AuthContext` for token/login/logout) |
| `lib/api/` | `client.ts` — `apiFetch`, `authenticatedFetch` |
| `constants/config.ts` | `API_BASE_URL` resolution |

## API base URL

Override order (see `constants/config.ts`, `app.config.ts`):

1. `EXPO_PUBLIC_API_BASE_URL` (build/runtime)
2. Expo `extra.apiUrl`

- **Dev:** usually `http://localhost:3000` (or host reachable from device/emulator)
- **Prod:** same origin as **gateway** (not raw frontend container port)

Use `authenticatedFetch` from `@/lib/api/client` — do not hard-code full URLs in components.

## Auth

- `useAuth()` from `@/contexts/AuthContext` for token and `handleUnauthorized`
- On 401/403, client calls `onUnauthorized` (typically logout)

## Tests (Vitest + Testing Library)

- Co-locate: `components/foo.test.tsx` next to `foo.tsx`
- Mock `@/contexts/AuthContext` and `@/lib/api/client` as in existing tests
- BDD-style `it('given X when Y then Z', ...)` with Given/When/Then comments when helpful

```bash
cd frontend && npm ci && npm run test:run
npm run lint
```

## Examples

- List + tests: `components/document-list.tsx`, `document-list.test.tsx`
- Form + tests: `components/document-create-form.tsx`, `document-create-form.test.tsx`
