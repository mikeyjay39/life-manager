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

# ---- Move to script directory ----
cd "$(dirname "$0")"

# ---- Load .env file into the shell ----
ENV_FILE=".${PROFILE}.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: env file '$ENV_FILE' not found"
    exit 1
fi

# Load variables, ignoring comments and empty lines
export $(grep -v '^#' "$ENV_FILE" | xargs -d '\n')

echo "Loaded environment variables from $ENV_FILE"
export ENV_FILE
echo "PROFILE=$PROFILE"
export PROFILE

# ---- Build Rust backend ----
cargo build 

# ---- Stop & remove only this project's containers ----
docker compose --profile "$PROFILE" down

# ---- Start backend with env file ----
docker compose --profile "$PROFILE" --env-file "$ENV_FILE" up

echo "Backend started with profile '$PROFILE'"
