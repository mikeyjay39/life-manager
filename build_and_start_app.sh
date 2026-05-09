#!/usr/bin/env sh

set -euo pipefail

PROFILE="$1"
: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: build_and_start_app.sh <test | dev | prod>"
  exit 1
fi

backend/start_backend.sh $PROFILE &
frontend/start_frontend.sh $PROFILE &
