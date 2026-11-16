#!/usr/bin/env bash
# Temporary #254 activation path: flip auth_users.active after signup without Resend.
# #259 replaces this with capture/file EmailSender + verify-email flow.
# Updates the DB inside the life_manager_dev container (reliable for CI and
# docker-from-dev-container where host bind mounts may not match).
# Usage: activate-user.sh <email>
set -euo pipefail

EMAIL="${1:?email required}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_PATH="${E2E_ENV_FILE:-$REPO_ROOT/.e2e.env}"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
DB_IN_CONTAINER="${E2E_DB_IN_CONTAINER:-/app/data/e2e.db}"

if [[ ! -f "$ENV_PATH" ]]; then
  echo "Error: missing $ENV_PATH" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_PATH"
set +a

: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME missing in $ENV_PATH}"
export COMPOSE_PROJECT_NAME
export ENV_FILE="${ENV_FILE:-.e2e.env}"

# Escape for a Python single-quoted string.
SAFE_EMAIL="${EMAIL//\\/\\\\}"
SAFE_EMAIL="${SAFE_EMAIL//\'/\\\'}"

cd "$REPO_ROOT"
CHANGED="$(
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev \
    exec -T life_manager_dev python3 -c "
import sqlite3
conn = sqlite3.connect('${DB_IN_CONTAINER}')
cur = conn.execute(
    \"UPDATE auth_users SET active = 1 WHERE username = '${SAFE_EMAIL}'\"
)
conn.commit()
print(cur.rowcount)
conn.close()
"
)"

CHANGED="$(echo "$CHANGED" | tr -d '[:space:]')"
if [[ "$CHANGED" != "1" ]]; then
  echo "Error: expected to activate 1 user for ${EMAIL}, got changes=${CHANGED}" >&2
  exit 1
fi

echo "Activated user (container sqlite temporary path; #259 will replace)"
