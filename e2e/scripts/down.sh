#!/usr/bin/env bash
# Tear down the e2e Compose project.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_PATH="${E2E_ENV_FILE:-$REPO_ROOT/.e2e.env}"

if [[ ! -f "$ENV_PATH" ]]; then
  echo "No $ENV_PATH; nothing to tear down."
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_PATH"
set +a

: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME missing in $ENV_PATH}"
export COMPOSE_PROJECT_NAME
export ENV_FILE="${ENV_FILE:-.e2e.env}"

cd "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev \
  down --remove-orphans || true

# Drop capture mail (raw verify/reset tokens) for this run.
if [[ -n "${EMAIL_CAPTURE_DIR_HOST:-}" && -d "${EMAIL_CAPTURE_DIR_HOST}" ]]; then
  rm -rf -- "${EMAIL_CAPTURE_DIR_HOST}"
  echo "Removed capture dir ${EMAIL_CAPTURE_DIR_HOST}"
fi

echo "Torn down project ${COMPOSE_PROJECT_NAME}"
