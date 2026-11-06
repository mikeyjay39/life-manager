#!/usr/bin/env bash
# Show Playwright PNGs from the manual-test skill in Ghostty (Kitty graphics).
# Under tmux, use --passthrough=tmux so Ghostty receives the sequences.
#
# Usage:
#   bash show-artifacts.sh [artifact-dir]
#
# Defaults: $PLAYWRIGHT_ARTIFACTS_DIR or /tmp/lm-playwright-artifacts
set -euo pipefail

ART="${1:-${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}}"
cols=$(tput cols 2>/dev/null || echo 100)
rows="${ROWS:-28}"

if ! command -v chafa >/dev/null 2>&1; then
  echo "chafa is not installed. Install it (for example: pacman -S chafa)." >&2
  echo "Artifact paths:" >&2
  ls -1 "$ART"/*.png 2>/dev/null || echo "(none in $ART)" >&2
  exit 1
fi

if [[ ! -d "$ART" ]]; then
  echo "Artifact dir not found: $ART" >&2
  exit 1
fi

passthrough=none
if [[ -n "${TMUX:-}" ]]; then
  passthrough=tmux
fi

printf 'TERM=%s passthrough=%s size=%sx%s dir=%s\n' \
  "${TERM:-?}" "$passthrough" "$cols" "$rows" "$ART"

shopt -s nullglob
files=()
for f in "$ART"/0{1..6}-*.png; do
  files+=("$f")
done
if [[ -f "$ART/error.png" ]]; then
  files+=("$ART/error.png")
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No screenshots in $ART" >&2
  exit 1
fi

for f in "${files[@]}"; do
  printf '\n\033[1m=== %s ===\033[0m\n' "$(basename "$f")"
  chafa -f kitty --passthrough="$passthrough" --polite=on -s "${cols}x${rows}" "$f"
done

printf '\nShown %d image(s) from %s\n' "${#files[@]}" "$ART"
