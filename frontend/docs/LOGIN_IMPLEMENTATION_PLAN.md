# Login Page Implementation Plan

This document is a plan for implementing the login flow in the Life Manager SPA frontend (Expo/React Native). Backend authentication is JWT-based. Another agent can use this plan to implement the changes.

---

## 1. Backend API Contract (reference)

- **Login:** `POST /api/v1/auth/login`
  - **Request body (JSON):** `{ "username": string, "password": string }`
  - **Success (200):** `{ "token": string }` — JWT
  - **Errors:** `401 Unauthorized` (invalid credentials), `500` (server error)

- **Protected routes:** Require header:
  - `Authorization: Bearer <token>`
  - Example protected endpoint: `GET /api/v1/auth/protected` (returns `"Hello <user_id>"` for testing).

- **JWT contents (for reference):** `sub` = user UUID, `exp` = expiration (1 hour from backend). Decoding in the frontend is optional (e.g. for display or expiry checks); the backend validates the token.

---

## 2. Frontend Architecture Overview

| Layer | Purpose |
|-------|---------|
| **API config** | Base URL for backend (env/config). |
| **Token storage** | Persist JWT securely and read on app launch. |
| **Auth context** | Hold `token \| null`, `isLoading`, `login()`, `logout()`, and optionally `user` (e.g. from decoded JWT). |
| **Authenticated API client** | Central place to call backend with `Authorization: Bearer <token>` and handle 401 (e.g. logout + redirect to login). |
| **Login screen** | Form (username, password) → call login API → store token → navigate to app. |
| **Auth gate** | Ensure unauthenticated users see login; authenticated users see main app (tabs). |
| **Logout** | Clear token and navigate to login. |

---

## 3. Step-by-Step Implementation

### 3.1 API base URL and config

- Add a single source of truth for the backend base URL (e.g. `constants/config.ts` or env).
- For local dev:
  - **Web:** `http://localhost:3000` (or whatever port the backend uses).
  - **Android emulator:** `http://10.0.2.2:3000`.
  - **iOS simulator:** `http://localhost:3000`.
  - **Physical device:** use your machine’s LAN IP (e.g. `http://192.168.x.x:3000`).
- Optional: use `expo-constants` and `app.config.js` / `app.config.ts` with `extra.apiUrl` and read via `Constants.expoConfig?.extra?.apiUrl` so the agent can switch URLs per environment without code changes.

**Deliverable:** e.g. `constants/config.ts` exporting `API_BASE_URL` (and optionally type for env).

---

### 3.2 Secure token storage

- Use **`expo-secure-store`** for storing the JWT on iOS/Android (secure keychain/keystore).
- For **web**, SecureStore may not be available or may fall back to localStorage; document or implement a fallback (e.g. `AsyncStorage` or in-memory + optional `localStorage`) so login still works on web.
- Provide two functions: e.g. `getStoredToken(): Promise<string | null>` and `setStoredToken(token: string): Promise<void>`, and `clearStoredToken(): Promise<void>`.

**Deliverable:** e.g. `lib/auth/storage.ts` (or `utils/auth-storage.ts`) with the above API.

---

### 3.3 Auth context

- Create an **AuthContext** that:
  - On mount: reads token from storage (3.2), sets `token` and `isLoading: false` (or a dedicated “hydration” flag).
  - Exposes: `token`, `isAuthenticated` (derived), `isLoading` (or “isRestoring”), `login(username, password)`, `logout()`.
- **login(username, password):**
  - Call `POST ${API_BASE_URL}/api/v1/auth/login` with JSON body `{ username, password }`.
  - On 200: parse `{ token }`, call `setStoredToken(token)`, update context state, return success.
  - On 401: return failure (e.g. “Invalid username or password”); optionally clear any existing stored token.
  - On other errors: return or throw with a generic message.
- **logout():** Call `clearStoredToken()` and set context token to `null`.
- Wrap the app (or the part that needs auth) in `AuthProvider` (e.g. in `app/_layout.tsx`).

**Deliverable:** e.g. `contexts/AuthContext.tsx` (or `lib/auth/AuthContext.tsx`) with `AuthProvider`, `useAuth()` hook, and the above behavior.

---

### 3.4 Authenticated API client

- Create a small client or helper that:
  - Takes the current `token` (from `useAuth()` or passed in).
  - Sends requests with `Authorization: Bearer <token>` and `Content-Type: application/json` where applicable.
  - On **401** response: call `logout()` (from context) and optionally navigate to login so the user isn’t stuck on a broken screen.
- Use this for all future authenticated requests (e.g. documents, profile). The login request itself does **not** need a token.

**Deliverable:** e.g. `lib/api/client.ts` with a function like `authenticatedFetch(url, options, { getToken, logout })` or a thin wrapper around `fetch` that uses `useAuth()` inside a hook (e.g. `useAuthenticatedFetch()`).

---

### 3.5 Login screen (UI + flow)

- **Route:** Add a dedicated login route. With Expo Router, options include:
  - `app/login.tsx` (stack screen at root), or
  - `app/(auth)/login.tsx` inside an `(auth)` group if you want multiple auth screens (e.g. login, forgot password later).
- **Layout:** A simple form screen with:
  - **Username:** text input (autoCapitalize off or “none”, autoCorrect false, secureTextEntry false).
  - **Password:** text input with `secureTextEntry={true}`.
  - **Submit button:** “Sign in” / “Log in”; disable while submitting.
  - **Loading:** show loading state on the button or a spinner while the request is in progress.
  - **Errors:** show inline message or `Alert.alert` on 401 or network error (e.g. “Invalid username or password” for 401, “Could not connect” for network failures).
- **Behavior:**
  - On submit: call `login(username, password)` from `useAuth()`.
  - On success: navigate to the main app (e.g. `router.replace('/(tabs)')` so the user can’t go back to the login screen with back button).
  - Reuse existing theming (e.g. `ThemedText`, `ThemedView`, `Colors`) and form patterns from `app/(tabs)/simple-form.tsx` where it makes sense (e.g. controlled inputs, loading state, error handling).
- **Accessibility:** Add `accessibilityLabel` (and optionally `accessibilityHint`) for username, password, and submit button.

**Deliverable:** `app/login.tsx` (or `app/(auth)/login.tsx`) and any small shared form components if extracted.

---

### 3.6 Auth gate (redirect unauthenticated users to login)

- **Option A (recommended):** In the root layout (`app/_layout.tsx`):
  - Wrap the app in `AuthProvider`.
  - If `isLoading` (restoring token from storage), show a splash or loading screen.
  - If not loading and `!isAuthenticated`, render the login screen (or redirect to `/login`).
  - If authenticated, render the existing `Stack` (tabs + modal) as today.
- **Option B:** Use a protected layout or HOC that wraps only `(tabs)` and redirects to `/login` when not authenticated; root layout always mounts both login and tabs and navigation decides. Option A is simpler for “one entry: login or app”.
- **Already logged in:** When the user is authenticated and navigates to `/login`, redirect them to the main app (e.g. `router.replace('/(tabs)')`) so they don’t see the login form again.

**Deliverable:** Updated `app/_layout.tsx` (and possibly a small `AuthGate` component) that implements the chosen flow.

---

### 3.7 Logout

- Add a way to log out (e.g. “Log out” in a settings tab, profile screen, or header).
- On press: call `logout()` from `useAuth()` then navigate to login (e.g. `router.replace('/login')`).

**Deliverable:** One or more UI entry points that call `logout()` and redirect; no new files strictly required if the logic lives in `AuthContext` and the existing layout/screens.

---

### 3.8 CORS and network (backend already allows origin)

- Backend uses `CorsLayer::new().allow_origin(tower_http::cors::Any)`, so the frontend can call it from web and from device/emulator as long as `API_BASE_URL` points to the correct host/port.

---

## 4. File and Folder Summary (suggested)

| Path | Purpose |
|------|---------|
| `constants/config.ts` | `API_BASE_URL` (and optional env typing). |
| `lib/auth/storage.ts` | `getStoredToken`, `setStoredToken`, `clearStoredToken` (SecureStore + web fallback). |
| `contexts/AuthContext.tsx` | `AuthProvider`, `useAuth()`, login/logout and token state. |
| `lib/api/client.ts` | Authenticated fetch helper (Bearer token, 401 → logout). |
| `app/login.tsx` (or `app/(auth)/login.tsx`) | Login form screen. |
| `app/_layout.tsx` | AuthProvider, auth gate, redirect to login or tabs. |

Existing: `app/(tabs)/_layout.tsx`, `constants/theme.ts`, `components/themed-*.tsx` — reuse for styling and layout.

---

## 5. Dependencies

- **expo-secure-store** — add if not present (`npx expo install expo-secure-store`). Used for JWT storage on native; ensure web fallback is implemented (e.g. `AsyncStorage` or `localStorage` via a small adapter).
- **AsyncStorage** — optional; useful as web fallback for token storage if SecureStore is not suitable on web (`@react-native-async-storage/async-storage`).

---

## 6. Testing Checklist (for the implementing agent)

- [ ] App cold start with no token → login screen.
- [ ] App cold start with valid token in storage → main app (tabs).
- [ ] Login with valid credentials → token stored, redirect to tabs.
- [ ] Login with invalid credentials → error message, no navigation.
- [ ] Logout → token cleared, redirect to login.
- [ ] Visiting `/login` when authenticated → redirect to tabs.
- [ ] Calling a protected endpoint (e.g. `GET /api/v1/auth/protected`) with token in header → success; without token or with invalid token → 401 and logout/redirect behavior if implemented in client.

---

## 7. Optional Follow-ups (out of scope for initial login)

- **Refresh token:** Backend currently issues a 1-hour JWT; no refresh endpoint was found. If one is added later, the client can store refresh token, call refresh on 401, and retry the request.
- **Decoding JWT in the app:** Only if you need to show user id or expiry in the UI; use a small library (e.g. `jwt-decode`) and never trust the payload for security (backend validates).
- **“Remember me”:** Could be implemented by choosing different storage (e.g. persistent vs in-memory) or storage duration in SecureStore.

---

This plan is ready for an implementing agent to follow step-by-step. All backend details are derived from `backend/src/infrastructure/auth/` and `backend/src/lib.rs`.
