#!/usr/bin/env sh

set -euo pipefail

PROFILE="$1"
: "${PROFILE:?PROFILE not set}"

if [[ "$PROFILE" == "prod" || "$PROFILE" == "docker-dev" ]]; then
  # In production / docker-dev, the frontend is served from Docker (not host Expo).
  echo "running in ${PROFILE} mode, skipping Expo frontend..."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
env_basename() {
  [[ "$1" == "docker-dev" ]] && echo "dev" || echo "$1"
}
ENV_PATH="$REPO_ROOT/.$(env_basename "$PROFILE").env"
if [[ -f "$ENV_PATH" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_PATH"
  set +a
fi

: "${FRONTEND_PORT:=8080}"
port="$FRONTEND_PORT"
if [[ "$PROFILE" == "dev" ]]; then
  echo "Stopping any process listening on TCP port ${port}..."
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti ":${port}" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "${pids:-}" ]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi
  else
    echo "Warning: neither fuser nor lsof found; cannot free port ${port}"
  fi
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
