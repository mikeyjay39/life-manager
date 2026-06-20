#!/bin/sh
set -e

LOCK_HASH_FILE=/app/node_modules/.package-lock.sha
CURRENT_HASH=$(sha256sum package-lock.json | awk '{print $1}')

if [ ! -f "$LOCK_HASH_FILE" ] || [ "$(cat "$LOCK_HASH_FILE")" != "$CURRENT_HASH" ]; then
  echo "Installing frontend dependencies (package-lock.json changed)..."
  npm ci
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
fi

exec npx expo start --web --host lan --port "${FRONTEND_PORT:-8080}"
