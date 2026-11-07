#!/usr/bin/env bash
# Source after profile env (e.g. .dev.env). Overrides APP_PORT / FRONTEND_PORT /
# EXPO_PUBLIC_API_BASE_URL from repo-root `.env.tilt.ports` when present.
# Call only for the host **dev** profile (not docker-dev / test / prod).
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

  # Refresh this worktree's slot claim so a long cargo build keeps the reservation.
  if [[ "${APP_PORT:-}" =~ ^[0-9]+$ ]] && (( APP_PORT >= 3000 )); then
    slot=$((APP_PORT - 3000))
    claim_dir="${LIFE_MANAGER_PORT_CLAIM_DIR:-/tmp/life-manager-dev-port-claims-${UID:-$(id -u)}}"
    mkdir -p "$claim_dir"
    {
      printf 'WORKTREE_ROOT=%s\n' "$REPO_ROOT"
      printf 'CLAIMED_AT=%s\n' "$(date +%s)"
    } >"${claim_dir}/slot-${slot}.claim"
  fi
fi
