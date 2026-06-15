#!/usr/bin/env bash

set -euo pipefail

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
      echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image] [--with-tesseract]"
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: build_and_start_app.sh <test | dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

BACKEND_EXTRA=()
if [ "$BUILD_IMAGE" -eq 1 ]; then
  BACKEND_EXTRA+=(--build-image)
fi
if [ "$WITH_TESSERACT" -eq 1 ]; then
  BACKEND_EXTRA+=(--with-tesseract)
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Dev uses host Expo (start_frontend.sh), not the frontend_dev container. Stop any
# leftover container so it does not bind FRONTEND_PORT with a stale image.
if [[ "$PROFILE" == "dev" ]]; then
  docker compose -f "$REPO_ROOT/docker-compose.yml" --env-file "$REPO_ROOT/.dev.env" --profile dev down 2>/dev/null || true
fi

backend/start_backend.sh "$PROFILE" "${BACKEND_EXTRA[@]}" &
frontend/start_frontend.sh "$PROFILE" &
