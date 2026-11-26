#!/usr/bin/env bash
# Write a runner-local .e2e.env for docker-dev e2e (EMAIL_PROVIDER=capture).
# Does not call Resend. Do not commit the generated file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${E2E_ENV_FILE:-$REPO_ROOT/.e2e.env}"

RUN_ID="${GITHUB_RUN_ID:-$$}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
# Keep ports in a quiet high range so host / parallel jobs clash less.
SLOT=$((RUN_ID % 200))
APP_PORT="${E2E_APP_PORT:-$((3100 + SLOT))}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-$((8100 + SLOT))}"
PROJECT="${COMPOSE_PROJECT_NAME:-lm-e2e-${RUN_ID}-${ATTEMPT}}"

# Unique capture sink per run (bind-mounted under backend/data).
CAPTURE_REL="e2e-mail-capture/${PROJECT}"
EMAIL_CAPTURE_DIR="/app/data/${CAPTURE_REL}"
EMAIL_CAPTURE_DIR_HOST="${REPO_ROOT}/backend/data/${CAPTURE_REL}"
mkdir -p "$EMAIL_CAPTURE_DIR_HOST"

# Disposable e2e-only secrets: new random values each run.
# Do not reuse in prod. Do not store in git-crypt .dev.env / .prod.env.
# Optional overrides: E2E_ADMIN_PASSWORD, E2E_JWT_SECRET (debug only).
e2e_rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-$(e2e_rand)}"
JWT_SECRET="${E2E_JWT_SECRET:-$(e2e_rand)}"

# Optional Grafana keys stay empty so Alloy is not required for e2e.
cat >"$OUT" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ENV_FILE=.e2e.env
COMPOSE_PROJECT_NAME=${PROJECT}
APP_PORT=${APP_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
EXPO_PUBLIC_API_BASE_URL=http://localhost:${APP_PORT}
APP_PUBLIC_BASE_URL=http://localhost:${FRONTEND_PORT}
DATABASE_URL=file:./data/e2e.db
TEST_TENANT_DATABASE_URL=file:./data/e2e-test-tenant.db
JWT_SECRET=${JWT_SECRET}
RUST_BACKTRACE=1
RUST_LOG=info
EMAIL_PROVIDER=capture
EMAIL_CAPTURE_DIR=${EMAIL_CAPTURE_DIR}
EMAIL_CAPTURE_DIR_HOST=${EMAIL_CAPTURE_DIR_HOST}
FRONTEND_URL=http://localhost:${FRONTEND_PORT}
API_BASE_URL=http://localhost:${APP_PORT}
E2E_DB_PATH=${REPO_ROOT}/backend/data/e2e.db
EOF

# Export for callers that source this script after generate.
export ENV_FILE=".e2e.env"
export COMPOSE_PROJECT_NAME="$PROJECT"
export APP_PORT FRONTEND_PORT
export EXPO_PUBLIC_API_BASE_URL="http://localhost:${APP_PORT}"
export APP_PUBLIC_BASE_URL="http://localhost:${FRONTEND_PORT}"
export FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
export API_BASE_URL="http://localhost:${APP_PORT}"
export E2E_ENV_FILE="$OUT"
export E2E_DB_PATH="$REPO_ROOT/backend/data/e2e.db"
export EMAIL_PROVIDER=capture
export EMAIL_CAPTURE_DIR
export EMAIL_CAPTURE_DIR_HOST

echo "Wrote $OUT (project=${PROJECT} APP_PORT=${APP_PORT} FRONTEND_PORT=${FRONTEND_PORT})"
echo "EMAIL_PROVIDER=capture EMAIL_CAPTURE_DIR=${EMAIL_CAPTURE_DIR} (Resend disabled)"
