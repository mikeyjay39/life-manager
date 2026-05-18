#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
REV_FILE="$BACKEND_DIR/rev.txt"

if commit="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)"; then
  printf '%s\n' "$commit" >"$REV_FILE"
elif [ -s "$REV_FILE" ]; then
  # Keep rev.txt from the build context (e.g. host wrote it before docker build).
  exit 0
else
  printf 'unknown\n' >"$REV_FILE"
fi
