#!/usr/bin/env bash
# Source after profile env (e.g. .dev.env). Overrides APP_PORT / FRONTEND_PORT /
# EXPO_PUBLIC_API_BASE_URL from repo-root `.env.tilt.ports` when present.
#
# Usage:  # shellcheck source=scripts/load-dev-ports.sh
#         . "$REPO_ROOT/scripts/load-dev-ports.sh"
: "${REPO_ROOT:?REPO_ROOT must be set before sourcing load-dev-ports.sh}"

PORTS_FILE="${REPO_ROOT}/.env.tilt.ports"
if [[ -f "$PORTS_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  . "$PORTS_FILE"
  set +a
  echo "Loaded port overrides from ${PORTS_FILE}"
fi
