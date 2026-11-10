# Frontend — agent instructions

Hub: [../AGENTS.md](../AGENTS.md) (**Critical Rules** and **Do not assume** apply). API / URLs: [../docs/agents/api.md](../docs/agents/api.md). Tests: [../docs/agents/testing.md](../docs/agents/testing.md).

Update this file and the hub when frontend conventions change.

## Layout

| Path | Role |
|------|------|
| `app/` | Expo Router shell (`(tabs)/`, `login.tsx`, `_layout.tsx`) — routes are shared across tenants |
| `components/` | Shared UI; co-locate `*.test.tsx` |
| `components/ui/` | Shared primitives: `button.tsx`, manager layout/form/list/feedback helpers (see **Manager UX conventions**), `confirm-dialog.tsx`, `date-picker.tsx` / `date-picker.web.tsx`, `field-label.tsx`, `text-input.tsx` / `text-input.web.tsx` (editable web keeps real `input`/`textarea` for Vimium; locked web fields use `View`+`Text`). Web focus helpers (`web-focus-ring.ts`, `web-form-enter-submit.ts`) — #201 |
| `components/auth/` | Shared auth UI (`login-form.tsx`, `signup-form.tsx`) |
| `contexts/` | `AuthContext` (tenant-scoped token + login), `ProtonConnectContext` (web Proton Drive session) |
| `hooks/` | Top-level hooks (not under `components/`). `use-web-escape-close.ts` — web Escape closes ConfirmDialog / manager Modals (#201; import `@/hooks/use-web-escape-close`) |
| `lib/tenant/` | Tenant registry, resolution, `TenantProvider`, `useTenant()` |
| `lib/proton-drive/` | Web-only Proton Drive SDK integration (`index.web.ts`); native stub in `index.ts` |
| `lib/tenant/theme/` | Theme types, defaults, typography scale (`typography.ts`), `mergeTenantTheme()`, `TenantThemeProvider` |
| `lib/api/` | `client.ts` — `apiFetch`, `authenticatedFetch`, `apiV1`; `types.ts` — generated API DTOs |
| `lib/api/generated/` | ts-rs output from Rust — **do not hand-edit** (see `generated/README.md`) |
| `lib/health/` | Shared Health helpers: `units.ts` (metric/imperial preference + **client-side** conversion; API stays metric-only), `chart-series.ts` (readings → chart points) |
| `lib/car/` | Shared Car helpers: `chart-series.ts` (maintenance events → odometer / cost / event_type chart series; miles only; USD from `cost_cents`) |
| `lib/format/` | Shared locale display helpers: `display.ts` (dates, USD from `cost_cents`, integers). Locale follows device/browser; wire format stays `YYYY-MM-DD` / cents. |
| `tenants/<id>/` | Tenant-owned screens, components, and `config.ts` |
| `constants/` | `theme.ts` — `defaultColors` / product `Fonts` (web sans stack); `config.ts` — `API_BASE_URL` |

Use `@/` path alias (`tsconfig.json`).

**Convention:** code under `tenants/<id>/` is tenant-specific; everything else in `components/`, `contexts/`, and `lib/` (except `lib/tenant/`) is shared.

## Multi-tenant

- Each tenant exports a `TenantModule` from `tenants/<id>/config.ts` (mirrors backend `TenantMount`).
- Register hostnames and mount metadata in `lib/tenant/registry.ts`.
- `TenantProvider` resolves the active tenant at bootstrap (hostname on web, env on native) and configures the API client prefix.
- `useTenant()` exposes `tenant.displayName`, `tenant.screens.Home`, optional `tenant.screens.Documents`, optional `tenant.screens.Health`, optional `tenant.screens.Car`, and `tenant.apiV1Prefix`.
- **Home** is the manager hub (icon tiles only). Document create/list/Proton live under **Document Manager** (`screens.Documents`), not on Home.
- Optional `screens.Documents` / `Health` / `Car` register manager routes (life-manager; test-tenant omits them).
- Hub tiles and `AppMenuBar` manager links both read `tenants/life-manager/manager-registry.ts` (`LIFE_MANAGER_MANAGERS`) for labels/icons/routes. Shared icon chrome: see **Icons (menu and hub)** under Manager UX. Hub may show Coming soon; the menu lists only registered managers. Always keep **Home** and **Log Out**. Documents label is **Documents**.
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
- **Header:** `theme.headerBackground` for parallax screens (Home hub and login branding). Manager pages use quiet chrome — see below.

**UI convention:** do not import `Colors` directly — use `useColorPalette()` or `useThemeColor()`. Use `useTenantBranding()` for copy and assets. Prefer `components/ui/button.tsx` for CTAs (`primary` | `secondary` | `destructive` | `outline`). For filled tint buttons, use `palette.onTint` for label text and spinners. Form labels: `field-label.tsx` (`required` adds an asterisk; accessible name is label + `, required`). Optional dates: `date-picker.tsx` (`YYYY-MM-DD` or `''`; web `input type="date"`).

Light/dark **mode** is resolved by `useColorScheme()` (`hooks/use-color-scheme.ts` / `.web.ts`). On web, browser `prefers-color-scheme` wins; React Native/OS is the fallback when the browser reports no preference. Native uses OS `Appearance` only.

| Hook / helper | Use for |
|------|---------|
| `useColorPalette()` | Current scheme palette (`tint`, `onTint`, `background`, `text`, `surface`, `border`, `muted`, `success`, `warning`, `danger`, …) |
| `useThemeColor(props, name)` | Themed text/view color with optional per-mode overrides |
| `ThemedText` / `typeStyle(role)` | Product type roles (`pageTitle`, `sectionTitle`, `body`, `meta`) + `Fonts.sans` |
| `useTenantBranding()` | Resolved copy, assets, header background |
| `useNavigationTheme()` | React Navigation theme (primary = tenant tint) |

Tests: wrap UI under test with `TenantThemeTestProvider` + `defaultResolvedTheme` (or a merged theme from `mergeTenantTheme()`).

## Manager UX conventions

Shared patterns for Documents, Health, and Cars. Prefer these over one-off screen styles. Do not invent new layout or feedback APIs when a shared helper already exists.

**Screens that use the pattern today:** `DocumentManagerScreen`, `HealthScreen`, `CarScreen` (and their panels under `tenants/life-manager/components/`).

### Layout primitives

Do not invent per-screen width or full-bleed CTA stretch.

| Primitive | Role |
|-----------|------|
| `ManagerScrollView` | Quiet manager shell: sticky `AppMenuBar`, compact `ManagerPageHeader`, no parallax image |
| `ManagerPageContent` | Centers the body (`MANAGER_CONTENT_MAX_WIDTH`); spaces children with `MANAGER_CONTENT_GAP` |
| `ManagerSection` | Section chrome + optional toolbar (`primaryAction` filled Add; `secondaryActions` outline; `toolbarExtra` for switches). Title leading/LTR |
| `ManagerPageHeader` | `pageTitle` role; subtitle uses `meta` |
| `ManagerCta` | Wraps `Button`; caps width by default (`fullWidth` opt-in) |

Stack sections as direct children of `ManagerPageContent`. Do not add per-screen `marginBottom` between sections. Prefer `ManagerSection` over one-off headers. Density tokens live in `manager-layout.ts` (`MANAGER_CONTENT_GAP`, `MANAGER_SECTION_PADDING`, `MANAGER_PAGE_PADDING_Y`, dense list tokens). Home may keep `ParallaxScrollView` + header assets.

### Quiet chrome

Manager pages omit parallax header images. Use `ManagerScrollView` + compact `ManagerPageHeader`. Keep section borders quiet (`palette.icon`). Home hub and login may keep branded parallax headers.

### Form vs results

`ManagerFormVsResults` keeps results as the default focus. Collapse create until Add. When `itemCount` is 0, show empty copy with one primary Add. Support `create` / `edit` on the same form surface. Cancel collapses. Keep `mode` on `create`/`edit` when validation fails so the form stays open.

Adopted on: Health vitals and doctor visits (#185); Document create (#187); Car maintenance (`car-maintenance-panel.tsx`, #186).

### Semantic color tokens

Use palette keys from `useColorPalette()`: `surface`, `border`, `muted`, `success`, `warning`, `danger`, plus `tint` / `onTint` / `text` / `background` / `icon`. Do not hard-code status reds or greens. Tenant `theme.light` / `theme.dark` may override; unspecified keys keep `defaultColors`. Control outlines use `border` (≥3:1 vs surface).

### Typography

Use `ThemedText` roles `pageTitle`, `sectionTitle`, `body`, `meta` (legacy aliases `title` / `subtitle` / `default` still work). Page titles outrank section titles. Scale and product sans: `lib/tenant/theme/typography.ts` (`Fonts.sans`).

### Dense data lists

Prefer `ManagerDataList` / `ManagerDataListRow` for history and results rows (health readings/visits, car maintenance). Hairline rows; aligned columns on wide viewports. Below `MANAGER_DATA_STACK_BELOW`, stack cells under the leading date. Secondary fields use `ThemedText` `meta` (muted). Keep row actions reachable. Document table (`document-grid.tsx`) shares the same padding tokens and meta typography for non-title cells.

### Loading skeletons

Use `ManagerListSkeleton` for initial empty→loading lists on Documents, Health, and Cars. Keep button `loading` spinners for submit actions. Do not invent per-screen placeholder rows.

### Sticky filter chrome

Use `ManagerStickyFilterChrome` for filter controls that should stay under `AppMenuBar` while the list scrolls (`APP_MENU_BAR_STICKY_OFFSET` in `manager-layout.ts`). Web is sticky; native is best-effort. Omit the chrome when there are no filter children. Page body keeps `overflow: visible` in `manager-scroll-view.tsx`. Adopted on: Document title search (`document-list.tsx`); Car maintenance type chips (`car-maintenance-panel.tsx`).

### Selection clarity

Use `createManagerPickerChipStyles` for HealthMember and Car pickers (tint border, left accent, tinted surface). Place `ManagerSelectionContext` near dependent sections (vitals, visits, charts, maintenance) so users see `Selected: Name` or clear empty copy without opening the picker alone.

### Feedback

Prefer `manager-feedback.tsx` (`ManagerFeedbackBanner` + `useManagerFeedback`) for create/update success and form/API errors. Brief success banners auto-clear. Errors stay until dismiss or the user fixes the cause. Error copy uses `palette.danger`.

### Icons (menu and hub)

Hub tiles and `AppMenuBar` share `IconSymbol` names from `manager-registry.ts`. Shared sizes and active/Coming-soon chrome live in `manager-nav-chrome.ts` (`MANAGER_MENU_ICON_SIZE`, `MANAGER_HUB_ICON_SIZE`; menu active = tint weight + soft tint fill; hub Coming soon stays quieter). Do not invent per-screen icon sizes for the same glyph set.

### Destructive confirms

Prefer `confirm-dialog.tsx` over `Alert.alert` / `window.confirm` (themed, blurred backdrop, works on web). Keep `ConfirmDialog` for destructive confirms. Delete/deactivate **triggers** use `outline` (not the primary section CTA). The ConfirmDialog confirm control uses `destructive` (fills from `palette.danger`).

### Web keyboard and focus

Convention (#201): interactive controls show a visible tint focus ring on web (`webFocusRingStyle` on `Button`, menu items, hub tiles, web `TextInput`, web date fields). `ConfirmDialog` and other manager Modals close on Escape via `useWebEscapeClose` (cancel path; does not confirm). Manager forms: `ManagerFormVsResults` `onEnterSubmit` (and Document create) use capture-phase Enter submit so fields that stopPropagation still submit. Multiline: Enter inserts a newline; Ctrl/Cmd+Enter submits. Gate `onEnterSubmit` with the same disabled/loading rules as the Save button. Native keeps existing press behavior. Modules: `components/ui/web-focus-ring.ts`, `components/ui/web-form-enter-submit.ts`, `hooks/use-web-escape-close.ts`.

### Locale date and number formatting

For manager lists and read-only detail views, prefer `lib/format/display.ts` — `formatDisplayDate`, `formatUsdFromCents`, `formatDisplayInteger`, `DISPLAY_EMPTY`. Locale follows the device/browser (`navigator.language`, then `Intl`); pass an explicit locale in tests. Wire/API values stay `YYYY-MM-DD` and cents. Do not build ad-hoc `$` strings or raw `toLocaleDateString` in manager rows. Car cost currency stays USD; grouping/symbol follow locale. Empty/missing values use the shared em dash (`DISPLAY_EMPTY`). Action accessibility labels may keep wire ISO dates for stable targeting.

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
| Manager UX conventions (docs) | This file — **Manager UX conventions** (layout, form-vs-results, tokens, type, quiet chrome, feedback, dense lists, skeletons, sticky filters, selection, icons, destructive confirms, focus, locale) |
| Manager layout primitives | `components/ui/manager-scroll-view.tsx`, `manager-page-header.tsx`, `manager-page-content.tsx`, `manager-section.tsx`, `manager-cta.tsx`, `manager-layout.ts` |
| Dense manager data lists | `components/ui/manager-data-list.tsx` (+ test); history rows in `health-reading-panel.tsx`, `doctor-visit-panel.tsx`, `car-maintenance-panel.tsx`; shared tokens also in `document-grid.tsx` |
| Sticky filter chrome | `components/ui/manager-sticky-filter-chrome.tsx` (+ test); Document title search; Car maintenance type chips; `APP_MENU_BAR_STICKY_OFFSET` |
| Manager form vs results | `components/ui/manager-form-vs-results.tsx` (+ test); compose with `ManagerSection` / `ManagerCta` |
| Manager selection clarity | `components/ui/manager-selection.ts` + `manager-selection-context.tsx`; HealthMember/Car pickers and dependent panels |
| Manager success/error feedback | `components/ui/manager-feedback.tsx` (+ test); Documents/Health/Cars create and update flows |
| Manager list loading skeletons | `components/ui/manager-list-skeleton.tsx` (+ test); initial empty→loading lists (keep button `loading` for submit) |
| Web keyboard and focus | `components/ui/web-focus-ring.ts`, `components/ui/web-form-enter-submit.ts`, `hooks/use-web-escape-close.ts` (#201); Button / menu / hub / fields / ConfirmDialog |
| Locale date/number display | `lib/format/display.ts` (`formatDisplayDate`, `formatUsdFromCents`, `formatDisplayInteger`, `DISPLAY_EMPTY`); dense lists and read-only detail (#202) |
| Destructive confirms | `components/ui/confirm-dialog.tsx`; outline triggers + `destructive` confirm; Documents/Health/Cars delete/deactivate |
| Home hub (manager launcher) | `tenants/life-manager/screens/HomeScreen.tsx` + `manager-registry.ts` + `manager-nav-chrome.ts` + `components/manager-hub-tile.tsx`; route `app/(tabs)/index.tsx`. Icon tiles only (Documents/Health/Cars); Coming soon when screen not registered; no create/list/Proton on Home. |
| Shared manager menu | `components/app-menu-bar.tsx` + `manager-registry.ts` + `manager-nav-chrome.ts` (`resolveRegisteredManagerMenuItems`). Home + registered managers + Log Out; shared active tint fill/weight from path. |
| Document Manager (create/list) | `tenants/life-manager/screens/DocumentManagerScreen.tsx`, route `app/(tabs)/documents.tsx`, menu via registry (**Documents**). Distinct sections: Proton setup, create (`ManagerFormVsResults` + inline `DocumentCreateForm`), and document list. Preview/delete stay on the list. Not on Home. |
| Health Manager screen | `tenants/life-manager/screens/HealthScreen.tsx`, route `app/(tabs)/health.tsx`, menu via registry (Health). Owns HealthMembers, vitals, charts, and doctor visits (not Home/Documents). |
| Car Manager screen | `tenants/life-manager/screens/CarScreen.tsx`, route `app/(tabs)/car.tsx`, menu via registry (Cars). Cars panel + maintenance panel + charts (not Home/Documents). |
| Cars on Car Manager | `tenants/life-manager/components/car-panel.tsx` (create / update / deactivate / reactivate / delete + ConfirmDialog; document link picker; include-inactive; selected Car for maintenance) |
| Maintenance on Car Manager | `tenants/life-manager/components/car-maintenance-panel.tsx` + `car-maintenance-form-utils.ts` (`ManagerFormVsResults` collapsed create / Add event on demand; create / edit / delete + ConfirmDialog; dollars→`cost_cents`; optional receipt Document; newest-first history; create disabled when no/inactive Car; `onEventsChanged` refreshes charts) |
| Car charts | `tenants/life-manager/components/car-charts-panel.tsx` + `lib/car/chart-series.ts` (`react-native-gifted-charts` LineChart / BarChart; odometer miles, event_type counts, cost USD; empty states; optional miles-since-oil callout) |
| HealthMembers on Health | `tenants/life-manager/components/health-member-panel.tsx` (create / update / deactivate / reactivate + picker; ConfirmDialog; no hard-delete MVP) |
| Health readings form + history | `tenants/life-manager/components/health-reading-panel.tsx` (`ManagerFormVsResults`; metric/imperial UI; convert then POST/PUT **metric-only**; delete + ConfirmDialog; history list; `onReadingsChanged` refreshes charts) |
| Doctor visit diary | `tenants/life-manager/components/doctor-visit-panel.tsx` + `doctor-visit-form-utils.ts` (`ManagerFormVsResults`; create / edit / delete + ConfirmDialog; selected active HealthMember) |
| Health charts | `tenants/life-manager/components/health-charts-panel.tsx` + `lib/health/chart-series.ts` + `lib/health/units.ts` (`react-native-gifted-charts` for Expo RN + web) |
| Health unit helpers (shared) | `lib/health/units.ts` (conversions, display formatters, `loadUnitPreference` / `saveUnitPreference`; locale default US/LR/MM → imperial when no saved pref) — never send imperial fields to the API. Distinct from `lib/format/display.ts` list/date/money display |
| Document list + tests (Document Manager) | `tenants/life-manager/components/document-list.tsx`, `document-list.test.tsx` (includes delete + ConfirmDialog); used by `DocumentManagerScreen` |
| Proton preview in modal (Document Manager) | `tenants/life-manager/components/document-proton-preview.tsx` (web; SDK thumb then download fallback) |
| Document create form + tests (Document Manager) | `tenants/life-manager/components/document-create-form.tsx`, `document-create-form.test.tsx`; used by `DocumentManagerScreen` |
| API client | `lib/api/client.ts` |
| Tenant resolution | `lib/tenant/resolve.ts`, `lib/tenant/TenantContext.tsx` |
