#!/usr/bin/env sh

set -euo pipefail

PROFILE="$1"
: "${PROFILE:?PROFILE not set}"

if [[ "$PROFILE" == "prod" ]]; then
  # In production mode, we assume the frontend is already built and served by a web server.
  echo "running in production mode, skipping Expo frontend..."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_PATH="$REPO_ROOT/.${PROFILE}.env"
if [[ -f "$ENV_PATH" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_PATH"
  set +a
fi

: "${FRONTEND_PORT:=8080}"
port="$FRONTEND_PORT"
echo "Closing existing Expo instances on port ${port}..."
pids=$(netstat -tulnp 2>/dev/null | grep ":${port} " | awk '{print $7}' | cut -d'/' -f1 | sort -u || true)
if [ -n "${pids:-}" ]; then
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
fi

echo "Starting Expo frontend on http://localhost:${port}/ ..."

cd "$(dirname "$0")"

if [ ! -x "./node_modules/.bin/expo" ]; then
  echo "🚀 Expo not found locally. Installing..."
  npm install --save-dev expo
else
  echo "✅ Expo is already installed locally."
fi

npx expo start --web --port "${port}"

cd -
