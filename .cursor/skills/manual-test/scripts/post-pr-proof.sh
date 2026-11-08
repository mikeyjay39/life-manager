#!/usr/bin/env bash
# Post manual-test proof on a GitHub PR with screenshot attachments.
#
# Usage:
#   post-pr-proof.sh --pr <n|url> --body-file <path> [--artifacts <dir>]
#   post-pr-proof.sh --pr <n|url> --artifacts <dir>   # body from stdin
#
# Requires gh 2.99+ (--attach). Does not commit PNGs. Does not print secrets.
set -euo pipefail

PR=""
ART="${PLAYWRIGHT_ARTIFACTS_DIR:-/tmp/lm-playwright-artifacts}"
BODY_FILE=""

usage() {
  echo "usage: $(basename "$0") --pr <n|url> (--body-file <path> | stdin) [--artifacts <dir>]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      PR="${2:-}"
      shift 2
      ;;
    --artifacts)
      ART="${2:-}"
      shift 2
      ;;
    --body-file)
      BODY_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage
      ;;
  esac
done

[[ -n "$PR" ]] || usage

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

if [[ -n "$BODY_FILE" ]]; then
  [[ -f "$BODY_FILE" ]] || { echo "body file not found: $BODY_FILE" >&2; exit 1; }
  cat "$BODY_FILE" >"$TMP_BODY"
else
  cat >"$TMP_BODY"
fi

# Ensure the comment embeds each PNG so gh rewrites paths to user-attachments.
# Skip files already referenced in the body (basename or full path).
mapfile -t pngs < <(find "$ART" -maxdepth 1 -type f -name '*.png' 2>/dev/null | sort)
if [[ ${#pngs[@]} -eq 0 ]]; then
  echo "warning: no PNGs in $ART; posting text-only proof" >&2
fi

need_shots_header=1
if grep -qE '^### Screenshots[[:space:]]*$|^## Screenshots[[:space:]]*$' "$TMP_BODY"; then
  need_shots_header=0
fi

attach_args=()
for f in "${pngs[@]+"${pngs[@]}"}"; do
  [[ -f "$f" ]] || continue
  base=$(basename "$f")
  name="${base%.png}"
  if grep -qF "$f" "$TMP_BODY" || grep -qE "!\\[[^]]*\\]\\([^)]*${base//./\\.}" "$TMP_BODY"; then
    :
  else
    if [[ "$need_shots_header" -eq 1 ]]; then
      {
        echo ""
        echo "### Screenshots"
        echo ""
      } >>"$TMP_BODY"
      need_shots_header=0
    fi
    echo "![${name}](${f})" >>"$TMP_BODY"
  fi
  attach_args+=(--attach "${f}#${name}")
done

if [[ ${#attach_args[@]} -eq 0 ]]; then
  gh pr comment "$PR" --body-file "$TMP_BODY"
else
  gh pr comment "$PR" --body-file "$TMP_BODY" "${attach_args[@]}"
fi
