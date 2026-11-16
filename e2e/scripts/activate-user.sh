#!/usr/bin/env bash
# Temporary #254 activation path: flip auth_users.active after signup without Resend.
# #259 replaces this with capture/file EmailSender + verify-email flow.
# Usage: activate-user.sh <email>
set -euo pipefail

EMAIL="${1:?email required}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_PATH="${E2E_ENV_FILE:-$REPO_ROOT/.e2e.env}"
DB_PATH="${E2E_DB_PATH:-$REPO_ROOT/backend/data/e2e.db}"

if [[ -f "$ENV_PATH" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_PATH"
  set +a
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Error: database not found at $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Error: sqlite3 CLI is required for temporary e2e activation" >&2
  exit 1
fi

# Escape single quotes for SQL literal.
SAFE_EMAIL="${EMAIL//\'/\'\'}"
CHANGED="$(
  sqlite3 "$DB_PATH" \
    "UPDATE auth_users SET active = 1 WHERE username = '${SAFE_EMAIL}'; SELECT changes();"
)"

if [[ "$CHANGED" != "1" ]]; then
  echo "Error: expected to activate 1 user for ${EMAIL}, got changes=${CHANGED}" >&2
  exit 1
fi

echo "Activated user (sqlite temporary path; #259 will replace)"
