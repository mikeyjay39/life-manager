#!/usr/bin/env sh
set -euo pipefail

# ---- Check arguments ----
BUILD_IMAGE=0
PROFILE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-image)
      BUILD_IMAGE=1
      shift
      ;;
    dev|test|prod)
      if [ -n "$PROFILE" ]; then
        echo "Error: profile specified more than once"
        exit 1
      fi
      PROFILE="$1"
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'"
      echo "Usage: start_backend.sh <test | dev | prod> [--build-image]"
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Usage: start_backend.sh <test | dev | prod> [--build-image]"
  exit 1
fi

: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: start_backend.sh <test | dev | prod> [--build-image]"
  exit 1
fi

echo "DEBUG: PROFILE='$PROFILE'"

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_PATH="$BACKEND_DIR/.${PROFILE}.env"

# ---- Load .env file into the shell ----
if [[ ! -f "$ENV_PATH" ]]; then
    echo "Error: env file '$ENV_PATH' not found"
    exit 1
fi

# Load variables, ignoring comments and empty lines
export $(grep -v '^#' "$ENV_PATH" | xargs -d '\n')

echo "Loaded environment variables from $ENV_PATH"
# Compose substitutes ${ENV_FILE} on the life-manager service; path is relative to repo root.
export ENV_FILE="backend/.${PROFILE}.env"
export PROFILE

# ---- Build Rust backend ----
cd "$BACKEND_DIR"
cargo build

# ---- Kill backend process ----
APP_PORT="${APP_PORT:=3000}"
echo "Stopping any process listening on TCP port ${APP_PORT}..."
if command -v fuser >/dev/null 2>&1; then
    fuser -k "${APP_PORT}/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti ":${APP_PORT}" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "${pids:-}" ]; then
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
    fi
else
    echo "Warning: neither fuser nor lsof found; cannot free port ${APP_PORT}"
fi

# ---- Start backend as separate process if dev ----
if [[ "$PROFILE" == "dev" ]]; then
    cargo run &
    echo "Backend started in development mode"
fi

# --- Build prod images (gateway template must match repo or nginx fails at runtime)
if [[ "$PROFILE" == "prod" && "$BUILD_IMAGE" -eq 1 ]]; then
  echo "Building Docker images for production..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile prod build --no-cache life-manager gateway frontend
fi

# ---- Docker Compose from repo root (compose file lives at root) ----
cd "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile "$PROFILE" down

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile "$PROFILE" up

echo "Backend started with profile '$PROFILE'"
