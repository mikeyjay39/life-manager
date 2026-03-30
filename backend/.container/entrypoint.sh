#!/usr/bin/env bash
set -euo pipefail

: "${USERNAME:?}"
: "${USER_ID:?}"
: "${GROUP_ID:?}"

marker="/home/${USERNAME}/.devcontainer-seeded"
if [[ ! -f "${marker}" ]]; then
  cp -a /opt/seed-home/. "/home/${USERNAME}/"
  chown -R "${USER_ID}:${GROUP_ID}" "/home/${USERNAME}"
  touch "${marker}"
  chown "${USER_ID}:${GROUP_ID}" "${marker}"
fi

exec runuser -u "${USERNAME}" -- "$@"
