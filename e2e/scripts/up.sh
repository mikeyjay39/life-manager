#!/usr/bin/env bash
# Boot docker-dev (life_manager_dev + frontend_dev only) for e2e.
# Local Docker builds only — never push/pull ECR for this path. Alloy is skipped.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
GEN="$REPO_ROOT/e2e/scripts/generate-env.sh"

# shellcheck source=generate-env.sh
source "$GEN"

ENV_PATH="${E2E_ENV_FILE}"
if ! grep -qE '^EMAIL_PROVIDER=log$' "$ENV_PATH"; then
  echo "Error: e2e requires EMAIL_PROVIDER=log in $ENV_PATH" >&2
  exit 1
fi
if grep -qiE '^EMAIL_PROVIDER=resend' "$ENV_PATH"; then
  echo "Error: EMAIL_PROVIDER=resend is forbidden for e2e" >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/backend/data"

export COMPOSE_PROJECT_NAME
export ENV_FILE=".e2e.env"
export APP_PORT FRONTEND_PORT EXPO_PUBLIC_API_BASE_URL

cd "$REPO_ROOT"

echo "Building docker-dev images (local only, no ECR)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev \
  build life_manager_dev frontend_dev

echo "Starting life_manager_dev + frontend_dev (Alloy skipped)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev \
  up -d --no-deps life_manager_dev frontend_dev

echo "Stack up. FRONTEND_URL=${FRONTEND_URL} API_BASE_URL=${API_BASE_URL}"
