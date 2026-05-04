#!/usr/bin/env bash
set -euo pipefail

# ---- Check arguments ----
if [ "$#" -lt 1 ]; then
  echo "Usage: start_backend.sh <test | dev | prod>"
  exit 1
fi

PROFILE="$1"
: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: start_backend.sh <test | dev | prod>"
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

# ---- Start backend as separate process if dev ----
if [[ "$PROFILE" == "dev" ]]; then
    cargo run &
    echo "Backend started in development mode"
fi

# ---- Docker Compose from repo root (compose file lives at root) ----
cd "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile "$PROFILE" down

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_PATH" --profile "$PROFILE" up

echo "Backend started with profile '$PROFILE'"
