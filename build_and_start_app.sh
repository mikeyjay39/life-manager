#!/usr/bin/env sh

set -euo pipefail

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
      echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image]"
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image]"
  exit 1
fi

: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image]"
  exit 1
fi

if [ "$BUILD_IMAGE" -eq 1 ]; then
  backend/start_backend.sh "$PROFILE" --build-image &
else
  backend/start_backend.sh "$PROFILE" &
fi
frontend/start_frontend.sh "$PROFILE" &
