# Frontend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API / URLs: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when frontend conventions change.

## Layout

| Path | Role |
|------|------|
| `app/` | Expo Router shell (`(tabs)/`, `login.tsx`, `_layout.tsx`) — routes are shared across tenants |
| `components/` | Shared UI; co-locate `*.test.tsx` |
| `components/ui/` | Shared primitives (`button.tsx` for CTAs with hover/press colors; `confirm-dialog.tsx` for themed confirmations; `date-picker.tsx` / `date-picker.web.tsx` for optional YYYY-MM-DD fields; `field-label.tsx` for form field labels; `text-input.tsx` / `text-input.web.tsx` for typed Car/Health fields — editable path keeps react-native `TextInput` (real `input`/`textarea` for Vimium); locked web fields render `View`+`Text` because Vimium matches every `textarea`) |
| `components/auth/` | Shared auth UI (`login-form.tsx`, `signup-form.tsx`) |
| `contexts/` | `AuthContext` (tenant-scoped token + login), `ProtonConnectContext` (web Proton Drive session) |
| `lib/tenant/` | Tenant registry, resolution, `TenantProvider`, `useTenant()` |
| `lib/proton-drive/` | Web-only Proton Drive SDK integration (`index.web.ts`); native stub in `index.ts` |
| `lib/tenant/theme/` | Theme types, defaults, `mergeTenantTheme()`, `TenantThemeProvider` |
| `lib/api/` | `client.ts` — `apiFetch`, `authenticatedFetch`, `apiV1`; `types.ts` — generated API DTOs |
| `lib/api/generated/` | ts-rs output from Rust — **do not hand-edit** (see `generated/README.md`) |
| `lib/health/` | Shared Health helpers: `units.ts` (metric/imperial preference + **client-side** conversion; API stays metric-only), `chart-series.ts` (readings → chart points) |
| `lib/car/` | Shared Car helpers: `chart-series.ts` (maintenance events → odometer / cost / event_type chart series; miles only; USD from `cost_cents`) |
| `tenants/<id>/` | Tenant-owned screens, components, and `config.ts` |
| `constants/` | `theme.ts` — `defaultColors` / `Fonts`; `config.ts` — `API_BASE_URL` |

Use `@/` path alias (`tsconfig.json`).

**Convention:** code under `tenants/<id>/` is tenant-specific; everything else in `components/`, `contexts/`, and `lib/` (except `lib/tenant/`) is shared.

## Multi-tenant

- Each tenant exports a `TenantModule` from `tenants/<id>/config.ts` (mirrors backend `TenantMount`).
- Register hostnames and mount metadata in `lib/tenant/registry.ts`.
- `TenantProvider` resolves the active tenant at bootstrap (hostname on web, env on native) and configures the API client prefix.
- `useTenant()` exposes `tenant.displayName`, `tenant.screens.Home`, optional `tenant.screens.Documents`, optional `tenant.screens.Health`, optional `tenant.screens.Car`, and `tenant.apiV1Prefix`.
- **Home** is the manager hub (icon tiles only). Document create/list/Proton live under **Document Manager** (`screens.Documents`), not on Home.
- Optional `screens.Documents` / `Health` / `Car` register manager routes (life-manager; test-tenant omits them).
- Hub tiles and `AppMenuBar` manager links both read `tenants/life-manager/manager-registry.ts` (`LIFE_MANAGER_MANAGERS`). Hub may show Coming soon; the menu lists only registered managers. Always keep **Home** and **Log Out**. Documents label is **Documents**.
- test-tenant has no optional screens → menu is **Home** + **Log Out** only.
- Follow-up: if the menu bar gets crowded with more managers, consider compact overflow; do not add a hamburger in MVP unless needed.
- Local dev options: [../docs/development_faq.md](../docs/development_faq.md#multi-tenant-frontend-dev).

## Tenant theme and branding

Provider order: `TenantProvider` → `TenantThemeProvider` → `AuthProvider` → `ProtonConnectProvider` (see `app/_layout.tsx`).

**Proton Drive:** `lib/proton-drive/` is resolved to `index.web.ts` on web and `index.ts` (no-op) on native. Document file uploads on web require an active Proton session; native keeps multipart POST to `/documents`. Preview and download of Proton-backed files are also web-only (SDK thumbnail, then full-file download fallback); there is no backend download route — see [development_faq.md](../docs/development_faq.md#preview-and-download-workflow).

Optional `theme` block on `tenants/<id>/meta.ts` — all fields optional; unspecified values use app defaults from `lib/tenant/theme/defaults.ts`:

- **Colors:** `theme.light` / `theme.dark` partial overrides merged over `defaultColors` (includes semantic tokens `surface`, `border`, `muted`, `success`, `warning`, `danger`; unspecified keys keep defaults)
- **Copy:** `theme.copy.loginSubtitle`, `theme.copy.homeTitleSuffix`
- **Assets:** `theme.assets.logo`, `theme.assets.headerImage` (`require()` tenant assets from `tenants/<id>/assets/` or shared `@/assets/images/`)
- **Header:** `theme.headerBackground` for parallax screens

**UI convention:** do not import `Colors` directly in components — use `useColorPalette()` or `useThemeColor()`. Use `useTenantBranding()` for copy and assets on tenant screens. Prefer `components/ui/button.tsx` for CTAs (Pressable with web hover / press background changes; variants `primary` | `secondary` | `destructive` | `outline`). For filled buttons using `palette.tint` as background, use `palette.onTint` for label text and spinners. Prefer `components/ui/confirm-dialog.tsx` over `Alert.alert` / `window.confirm` for user confirmations (themed, blurred backdrop, works on web).

Use `components/ui/field-label.tsx` for form field labels. Set `required` to show an asterisk. The accessible name is the label text plus `, required`.

Use `components/ui/date-picker.tsx` for optional date fields. Value is `YYYY-MM-DD` or `''`. Web uses `input type="date"` (`date-picker.web.tsx`); native uses `@react-native-community/datetimepicker`. Clear stays available when a value is set.

Light/dark **mode** is resolved by `useColorScheme()` (`hooks/use-color-scheme.ts` / `.web.ts`). On web, browser `prefers-color-scheme` wins; React Native/OS is the fallback when the browser reports no preference. Native uses OS `Appearance` only.

| Hook | Use for |
|------|---------|
| `useColorPalette()` | Current scheme palette (`tint`, `onTint`, `background`, `text`, `surface`, `border`, `muted`, `success`, `warning`, `danger`, …) |
| `useThemeColor(props, name)` | Themed text/view color with optional per-mode overrides |
| `useTenantBranding()` | Resolved copy, assets, header background |
| `useNavigationTheme()` | React Navigation theme (primary = tenant tint) |

Tests: wrap UI under test with `TenantThemeTestProvider` + `defaultResolvedTheme` (or a merged theme from `mergeTenantTheme()`).

## API and auth

- Base URL and device notes: [../docs/agents/api.md](../docs/agents/api.md)
- `API_BASE_URL` — server origin (e.g. `http://localhost:3000` in dev, empty for same-origin prod)
- Build API paths with `apiV1('/documents')` from `@/lib/api/client` — prefix comes from the active tenant via `configureApiClient`
- Do not hard-code `/life-manager` or `/api/v1` in components
- `authenticatedFetch` from `@/lib/api/client` — not raw `fetch` with hard-coded hosts
- API DTO types: import from `@/lib/api/types` (generated from Rust via ts-rs)
- `useAuth()` from `@/contexts/AuthContext`; 401/403 → `handleUnauthorized`
- JWT tokens are stored per tenant (`auth_token:<tenant-id>`)

## Tests

- Vitest + Testing Library; mock `AuthContext` and `@/lib/api/client` (see existing `*.test.tsx`)
- Wrap components that call `useTenant()` or `useAuth()` with `TenantTestProvider` + `AuthProvider` as needed
- BDD-style names and Given/When/Then comments: [../docs/agents/testing.md](../docs/agents/testing.md)

```bash
cd frontend && npm ci && npm run test:run
npm run lint
```

**Playwright** (devDependency for the [manual-test](../.cursor/skills/manual-test/) skill): `npm run playwright:install` downloads Chromium. Not part of Vitest/CI unit runs.

## Workflow diagrams

Multi-step UI flows (auth → fetch → render, wizards, tenant resolution, etc.) follow the hub [**Definition of done**](../AGENTS.md#definition-of-done): add an ASCII UML sequence or activity diagram as a comment on the orchestrating component or hook. Canonical backend example: [`document_handler.rs`](../backend/libs/life-manager/src/infrastructure/document/document_handler.rs) (`create_document`).

## Examples

| Task | Files |
|------|--------|
| Tenant config | `tenants/life-manager/meta.ts` (hostnames, API prefix, optional `theme`) |
| Tenant theme merge | `lib/tenant/theme/merge-theme.ts`, `TenantThemeContext.tsx` |
| Shared login / signup | `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, `app/login.tsx`, `app/signup.tsx` |
| Home hub (manager launcher) | `tenants/life-manager/screens/HomeScreen.tsx` + `manager-registry.ts` + `components/manager-hub-tile.tsx`; route `app/(tabs)/index.tsx`. Icon tiles only (Documents/Health/Cars); Coming soon when screen not registered; no create/list/Proton on Home. |
| Shared manager menu | `components/app-menu-bar.tsx` + `tenants/life-manager/manager-registry.ts` (`resolveRegisteredManagerMenuItems`). Home + registered managers + Log Out; active state from path. |
| Document Manager (create/list) | `tenants/life-manager/screens/DocumentManagerScreen.tsx`, route `app/(tabs)/documents.tsx`, menu via registry (**Documents**). Owns Proton connect, create, list, preview, and delete (not Home). |
| Health Manager screen | `tenants/life-manager/screens/HealthScreen.tsx`, route `app/(tabs)/health.tsx`, menu via registry (Health). Owns HealthMembers, vitals, charts, and doctor visits (not Home/Documents). |
| Car Manager screen | `tenants/life-manager/screens/CarScreen.tsx`, route `app/(tabs)/car.tsx`, menu via registry (Cars). Cars panel + maintenance panel + charts (not Home/Documents). |
| Cars on Car Manager | `tenants/life-manager/components/car-panel.tsx` (create / update / deactivate / reactivate / delete + ConfirmDialog; document link picker; include-inactive; selected Car for maintenance) |
| Maintenance on Car Manager | `tenants/life-manager/components/car-maintenance-panel.tsx` + `car-maintenance-form-utils.ts` (create / edit / delete + ConfirmDialog; dollars→`cost_cents`; optional receipt Document; newest-first history; create disabled when no/inactive Car; `onEventsChanged` refreshes charts) |
| Car charts | `tenants/life-manager/components/car-charts-panel.tsx` + `lib/car/chart-series.ts` (`react-native-gifted-charts` LineChart / BarChart; odometer miles, event_type counts, cost USD; empty states; optional miles-since-oil callout) |
| HealthMembers on Health | `tenants/life-manager/components/health-member-panel.tsx` (create / update / deactivate / reactivate + picker; ConfirmDialog; no hard-delete MVP) |
| Health readings form + history | `tenants/life-manager/components/health-reading-panel.tsx` (metric/imperial UI; convert then POST/PUT **metric-only**; delete + ConfirmDialog; history list; `onReadingsChanged` refreshes charts) |
| Doctor visit diary | `tenants/life-manager/components/doctor-visit-panel.tsx` + `doctor-visit-form-utils.ts` (create / edit / delete + ConfirmDialog; selected active HealthMember) |
| Health charts | `tenants/life-manager/components/health-charts-panel.tsx` + `lib/health/chart-series.ts` + `lib/health/units.ts` (`react-native-gifted-charts` for Expo RN + web) |
| Health unit helpers (shared) | `lib/health/units.ts` (conversions, display formatters, `loadUnitPreference` / `saveUnitPreference`; locale default US/LR/MM → imperial when no saved pref) — never send imperial fields to the API |
| Document list + tests (Document Manager) | `tenants/life-manager/components/document-list.tsx`, `document-list.test.tsx` (includes delete + ConfirmDialog); used by `DocumentManagerScreen` |
| Proton preview in modal (Document Manager) | `tenants/life-manager/components/document-proton-preview.tsx` (web; SDK thumb then download fallback) |
| Document create form + tests (Document Manager) | `tenants/life-manager/components/document-create-form.tsx`, `document-create-form.test.tsx`; used by `DocumentManagerScreen` |
| API client | `lib/api/client.ts` |
| Tenant resolution | `lib/tenant/resolve.ts`, `lib/tenant/TenantContext.tsx` |
