#!/usr/bin/env bash

set -euo pipefail

env_basename() {
  [[ "$1" == "docker-dev" ]] && echo "dev" || echo "$1"
}

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
      echo "Usage: build_and_start_app.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Usage: build_and_start_app.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

: "${PROFILE:?PROFILE not set}"

# ---- Validate profile ----
if [[ "$PROFILE" != "dev" && "$PROFILE" != "docker-dev" && "$PROFILE" != "test" && "$PROFILE" != "prod" ]]; then
  echo "Error: invalid profile '$PROFILE'"
  echo "Usage: build_and_start_app.sh <test | dev | docker-dev | prod> [--build-image] [--with-tesseract]"
  exit 1
fi

# docker-dev bakes source into images; always rebuild so code changes apply.
if [[ "$PROFILE" == "docker-dev" ]]; then
  BUILD_IMAGE=1
fi

BACKEND_EXTRA=()
if [ "$BUILD_IMAGE" -eq 1 ]; then
  BACKEND_EXTRA+=(--build-image)
fi
if [ "$WITH_TESSERACT" -eq 1 ]; then
  BACKEND_EXTRA+=(--with-tesseract)
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_BASENAME="$(env_basename "$PROFILE")"
DEV_ENV_FILE="$REPO_ROOT/.${ENV_BASENAME}.env"

# Dev uses host Expo (start_frontend.sh), not the frontend_dev container. Stop any
# leftover containers so they do not bind FRONTEND_PORT or APP_PORT with stale images.
if [[ "$PROFILE" == "dev" ]]; then
  docker compose -f "$REPO_ROOT/docker-compose.yml" --env-file "$DEV_ENV_FILE" --profile dev --profile docker-dev down 2>/dev/null || true
fi

if [[ "$PROFILE" == "docker-dev" ]]; then
  docker compose -f "$REPO_ROOT/docker-compose.yml" --env-file "$DEV_ENV_FILE" --profile dev --profile docker-dev down 2>/dev/null || true

  if [[ -f "$DEV_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$DEV_ENV_FILE"
    set +a
  fi
  : "${FRONTEND_PORT:=8080}"
  echo "Closing existing Expo instances on port ${FRONTEND_PORT}..."
  pids=$(netstat -tulnp 2>/dev/null | grep ":${FRONTEND_PORT} " | awk '{print $7}' | cut -d'/' -f1 | sort -u || true)
  if [ -n "${pids:-}" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi

  backend/start_backend.sh "$PROFILE" "${BACKEND_EXTRA[@]}" &
else
  backend/start_backend.sh "$PROFILE" "${BACKEND_EXTRA[@]}" &
  frontend/start_frontend.sh "$PROFILE" &
fi
