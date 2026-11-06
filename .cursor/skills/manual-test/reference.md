# Manual test — reference

## Ports (dev defaults)

Load from repo-root `.dev.env` when present. Defaults:

| Variable | Default | Use |
|----------|---------|-----|
| `APP_PORT` | `3000` | Backend HTTP on the host |
| `FRONTEND_PORT` | `8080` | Expo web on the host |

- API origin: `http://127.0.0.1:${APP_PORT}`
- Expo web: `http://localhost:${FRONTEND_PORT}`

Do not print secrets from `.dev.env`.

## Health poll

After `./build_and_start_app.sh dev`, wait for the backend (compile can take 2–3 minutes):

```bash
APP_PORT="${APP_PORT:-3000}"
for i in $(seq 1 60); do
  body=$(curl -sf "http://127.0.0.1:${APP_PORT}/api/health" || true)
  if [ "$body" = '"up"' ]; then
    echo "backend ready"
    break
  fi
  sleep 5
done
```

Confirm Expo:

```bash
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
curl -sf -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${FRONTEND_PORT}/" || true
# Or: ss -ltn | grep ":${FRONTEND_PORT} "
```

Optional version check:

```bash
curl -sf "http://127.0.0.1:${APP_PORT}/api/version"
```

## Auth login (JWT)

Protected document routes need `Authorization: Bearer <token>`.

```bash
APP_PORT="${APP_PORT:-3000}"
curl -sS -X POST "http://127.0.0.1:${APP_PORT}/life-manager/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<email>","password":"<password>"}'
```

Use the `token` field from the JSON response. If login fails (inactive user / unknown credentials), ask the user for an active account. Agents must not run write SQL to activate users — see [docs/agents/api.md](../../../docs/agents/api.md).

Test-tenant pilot (auth only):

```bash
curl -sS -X POST "http://127.0.0.1:${APP_PORT}/test-tenant/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<email>","password":"<password>"}'
```

## Common API curls

Replace `TOKEN` and IDs as needed. Full route list: [docs/agents/api.md](../../../docs/agents/api.md).

```bash
APP_PORT="${APP_PORT:-3000}"
BASE="http://127.0.0.1:${APP_PORT}/life-manager/api/v1"

# Auth smoke
curl -sS -H "Authorization: Bearer TOKEN" "$BASE/auth/protected"

# List documents by title
curl -sS -H "Authorization: Bearer TOKEN" "$BASE/documents/?title=MYTEST"

# Get document
curl -sS -H "Authorization: Bearer TOKEN" \
  "$BASE/documents/550e8400-e29b-41d4-a716-446655440000"

# Create (multipart)
curl -sS -X POST -H "Authorization: Bearer TOKEN" \
  -F 'json={"title":"MYTEST","content":"example"}' \
  -F 'file=@README.md' \
  "$BASE/documents/"

# Delete
curl -sS -X DELETE -H "Authorization: Bearer TOKEN" \
  -o /dev/null -w "%{http_code}\n" \
  "$BASE/documents/<uuid>"
```

## Frontend UI checks (Playwright)

`playwright` is a frontend **devDependency**. Chromium binaries are not in git; they live under `~/.cache/ms-playwright`.

Install / refresh Chromium:

```bash
cd frontend
npm ci   # or npm install
npm run playwright:install
```

Smoke script (login → list → edit one document). Run from `frontend/`. The script uses `createRequire` on `frontend/package.json` so `playwright` loads from `frontend/node_modules` (bare ESM import from `.cursor/skills/` cannot see that tree):

```bash
cd frontend
set -a && source ../.dev.env && set +a
export FRONTEND_URL="http://localhost:${FRONTEND_PORT:-8080}"
# Optional: PLAYWRIGHT_ARTIFACTS_DIR=/tmp/lm-playwright-artifacts
node ../.cursor/skills/manual-test/scripts/ui-smoke.mjs
```

Uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.dev.env`. Do not print them. Screenshots default to `/tmp/lm-playwright-artifacts/`.

**Locators:** Expo web can mount a hidden duplicate tree. Prefer `:visible` (for example `[aria-label="Edit document"]:visible`). Clicking `.first()` on a hidden node times out.

**Host libs:** if Chromium fails to launch (missing shared libraries), install Playwright OS deps for your platform (`npx playwright install-deps` where supported, or the equivalent Arch/Debian packages). Then retry `npm run playwright:install`.

For multi-tenant local hosts, see [docs/development_faq.md](../../../docs/development_faq.md#multi-tenant-frontend-dev).

## Show screenshots (Ghostty + tmux)

Ghostty paints images via the **Kitty graphics** protocol. It does not use Sixel.

Under **tmux**, plain Kitty escapes are stripped. You need:

1. `set -g allow-passthrough on` in tmux (required once per config).
2. `chafa -f kitty --passthrough=tmux` (the helper sets this when `$TMUX` is set).

Host tool: **`chafa`** (for example `pacman -S chafa`). Not a repo dependency.

Helper (prints to the current TTY):

```bash
bash .cursor/skills/manual-test/scripts/show-artifacts.sh /tmp/lm-playwright-artifacts
```

Skill path after UI smoke (opens a dedicated window so Ghostty receives passthrough):

```bash
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
SHOW="$(pwd)/.cursor/skills/manual-test/scripts/show-artifacts.sh"
tmux new-window -n manual-test-shots \
  "bash '$SHOW' '$ART'; echo; echo Done. Press Enter.; read"
tmux select-window -t manual-test-shots
```

Agents also **Read** each PNG into the chat so proof is visible without the pane.

## Failure notes

- Port already in use: `build_and_start_app.sh` / `start_backend.sh` try to free `APP_PORT` / `FRONTEND_PORT` for **dev**.
- Health stuck: check the background `cargo run` output; confirm `.dev.env` exists.
- Signup users stay inactive until the user activates them in SQLite (agents do not write).
- Stack started with a short-lived shell may die when that shell exits — keep backend/Expo as persistent background jobs.
