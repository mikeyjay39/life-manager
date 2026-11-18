#!/usr/bin/env bash
# Run the local e2e flow: install → stack up → wait → Playwright → stack down.
# Default is headless (same as CI / npm run test:e2e).
# Playwright Test has no --slow-mo CLI flag; use --debug or headed for step control.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
Usage: ./run-e2e.sh [options] [--] [playwright args...]

Run local e2e: npm ci → playwright:install → stack:up → stack:wait →
playwright test → stack:down (always, unless --keep-stack).

Options:
  --headed       Show the browser (needs a working DISPLAY).
  --debug        Pass Playwright --debug (inspector / step-through).
  --ui           Pass Playwright --ui (interactive UI mode).
  --keep-stack   Do not run stack:down on exit.
  --skip-install Skip npm ci and playwright:install.
  -h, --help     Show this help and exit.

Extra args after options go to playwright test, e.g.:
  ./run-e2e.sh --headed car/happy-path.spec.ts
  ./run-e2e.sh --skip-install -- tests/smoke.spec.ts

Note: Playwright Test has no --slow-mo CLI flag. Use --debug, --headed,
or launchOptions.slowMo in playwright.config.ts when you need delay.
EOF
}

HEADED=0
DEBUG=0
UI=0
KEEP_STACK=0
SKIP_INSTALL=0
PLAYWRIGHT_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --headed)
      HEADED=1
      shift
      ;;
    --debug)
      DEBUG=1
      shift
      ;;
    --ui)
      UI=1
      shift
      ;;
    --keep-stack)
      KEEP_STACK=1
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --)
      shift
      PLAYWRIGHT_ARGS+=("$@")
      break
      ;;
    -*)
      # Unknown script option: forward to Playwright (e.g. --grep).
      PLAYWRIGHT_ARGS+=("$1")
      shift
      ;;
    *)
      PLAYWRIGHT_ARGS+=("$1")
      shift
      ;;
  esac
done

cleanup() {
  local exit_code=$?
  if [[ "$KEEP_STACK" -eq 0 ]]; then
    echo "Tearing down e2e stack..."
    npm run stack:down || true
  else
    echo "Keeping e2e stack (--keep-stack)."
  fi
  exit "$exit_code"
}

trap cleanup EXIT

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "Installing e2e npm deps..."
  npm ci
  echo "Installing Playwright Chromium..."
  npm run playwright:install
else
  echo "Skipping install (--skip-install)."
fi

echo "Starting e2e stack..."
npm run stack:up
echo "Waiting for API and frontend..."
npm run stack:wait

CMD=(npx playwright test)
if [[ "$HEADED" -eq 1 ]]; then
  CMD+=(--headed)
fi
if [[ "$DEBUG" -eq 1 ]]; then
  CMD+=(--debug)
fi
if [[ "$UI" -eq 1 ]]; then
  CMD+=(--ui)
fi
if [[ ${#PLAYWRIGHT_ARGS[@]} -gt 0 ]]; then
  CMD+=("${PLAYWRIGHT_ARGS[@]}")
fi

echo "Running: ${CMD[*]}"
"${CMD[@]}"
# EXIT trap runs stack:down (unless --keep-stack) and exits with Playwright status.
