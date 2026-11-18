#!/usr/bin/env bash
# Removed: #254 temporary SQLite active=1 path.
# #259 activates users via CaptureFileEmailSender + verify-email.
# Use e2e/helpers/auth.ts createEphemeralUser() instead.
set -euo pipefail
echo "Error: activate-user.sh is retired. Use capture mail + verify (createEphemeralUser)." >&2
exit 1
