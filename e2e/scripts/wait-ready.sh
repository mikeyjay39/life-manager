#!/usr/bin/env bash
# Wait/retry until GET /api/health and the frontend URL respond.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_PATH="${E2E_ENV_FILE:-$REPO_ROOT/.e2e.env}"

if [[ -f "$ENV_PATH" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PATH"
  set +a
fi

API_BASE_URL="${API_BASE_URL:-http://localhost:${APP_PORT:-3000}}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:${FRONTEND_PORT:-8080}}"
HEALTH_URL="${API_BASE_URL}/api/health"
# Cold life_manager_dev cargo compile on an empty volume often exceeds 10 minutes on CI.
MAX_ATTEMPTS="${E2E_WAIT_ATTEMPTS:-180}"
SLEEP_SECS="${E2E_WAIT_SLEEP_SECS:-5}"

health_ok() {
  local body
  body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  # Accept plain up or JSON-ish "up".
  [[ "$body" == "up" || "$body" == '"up"' ]]
}

frontend_ok() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$FRONTEND_URL" 2>/dev/null || echo 000)"
  [[ "$code" =~ ^[23][0-9][0-9]$ ]]
}

echo "Waiting for health at ${HEALTH_URL} and frontend at ${FRONTEND_URL}..."
for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  if health_ok && frontend_ok; then
    echo "Ready after attempt ${i}"
    exit 0
  fi
  echo "Attempt ${i}/${MAX_ATTEMPTS}: not ready yet"
  sleep "$SLEEP_SECS"
done

echo "Timed out waiting for stack readiness" >&2
exit 1
