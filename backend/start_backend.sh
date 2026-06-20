#!/usr/bin/env bash
set -euo pipefail

env_basename() {
  [[ "$1" == "docker-dev" ]] && echo "dev" || echo "$1"
}

# shellcheck source=../scripts/loki-docker-plugin-setup.sh
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/loki-docker-plugin-setup.sh"

compose_up() {
  local -a profile_args=()
  while [ "$#" -gt 0 ]; do
    profile_args+=(--profile "$1")
    shift
  done
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" "${profile_args[@]}" down
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" "${profile_args[@]}" up -d loki grafana
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" "${profile_args[@]}" up
}

# ---- Check arguments ----
BUILD_IMAGE=0
WITH_TESSERACT=0
PROFILE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-image)
      BUILD_IMAGE=1
      shift
      ;;
    --with-tesseract)
      WITH_TESSERACT=1
      shift
      ;;
    dev|docker-dev|test|prod)
      if [ -n "$PROFILE" ]; then
        echo "Error: profile specified more than once"
        exit 1
      fi
      PROFILE="$1"
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'"
      echo "Usage: start_backend.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Usage: start_backend.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "docker-dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: start_backend.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

# docker-dev bakes source into images; always rebuild so code changes apply.
if [[ "$PROFILE" == "docker-dev" ]]; then
  BUILD_IMAGE=1
fi

echo "DEBUG: PROFILE='$PROFILE' WITH_TESSERACT='$WITH_TESSERACT' BUILD_IMAGE='$BUILD_IMAGE'"

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_BASENAME="$(env_basename "$PROFILE")"
ENV_PATH="$REPO_ROOT/.${ENV_BASENAME}.env"

# ---- Load .env file into the shell ----
if [[ ! -f "$ENV_PATH" ]]; then
    echo "Error: env file '$ENV_PATH' not found"
    exit 1
fi

# Load variables, ignoring comments and empty lines
export $(grep -v '^#' "$ENV_PATH" | xargs -d '\n')

if [[ "$WITH_TESSERACT" -eq 1 ]]; then
  export TESSERACT_ENABLED=true
fi

echo "Loaded environment variables from $ENV_PATH"
# Compose substitutes ${ENV_FILE} on backend services; path is relative to repo root.
export ENV_FILE=".${ENV_BASENAME}.env"
export PROFILE


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
   # ---- Build Rust backend ----
    cd "$BACKEND_DIR"
    "$BACKEND_DIR/scripts/write_rev.sh"
    cargo build
    cargo run &
    echo "Backend started in development mode"
fi

# --- Build prod images (gateway template must match repo or nginx fails at runtime)
if [[ "$PROFILE" == "prod" && "$BUILD_IMAGE" -eq 1 ]]; then
  echo "Building Docker images for production..."
  "$BACKEND_DIR/scripts/write_rev.sh"
  if [[ "$WITH_TESSERACT" -eq 1 ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile prod --profile tesseract build --no-cache life-manager gateway frontend
  else
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile prod build --no-cache life-manager gateway frontend
  fi
fi

# --- Build docker-dev images (always — source is baked in, not bind-mounted)
if [[ "$PROFILE" == "docker-dev" ]]; then
  echo "Building Docker images for docker-dev..."
  if [[ "$WITH_TESSERACT" -eq 1 ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev --profile tesseract build life_manager_dev frontend_dev
  else
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile docker-dev build life_manager_dev frontend_dev
  fi
fi

# ---- Docker Compose from repo root (compose file lives at root) ----
cd "$REPO_ROOT"

if [[ "$PROFILE" == "test" ]]; then
  echo "Skipping docker compose for profile test (auxiliary stack only via explicit profiles)."
elif [[ "$PROFILE" == "dev" ]]; then
  echo "Skipping docker compose for profile dev (backend on host; Expo via start_frontend.sh)."
elif [[ "$PROFILE" == "docker-dev" ]]; then
  loki_docker_plugin_setup
  if [[ "$WITH_TESSERACT" -eq 1 ]]; then
    compose_up docker-dev tesseract
  else
    compose_up docker-dev
  fi
else
  loki_docker_plugin_setup
  if [[ "$WITH_TESSERACT" -eq 1 ]]; then
    compose_up "$PROFILE" tesseract
  else
    compose_up "$PROFILE"
  fi
fi

echo "Backend started with profile '$PROFILE'"
