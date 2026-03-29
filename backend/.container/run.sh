#!/usr/bin/env bash
set -e

# Wrapper: reuses a named container (no --rm) so pacman/yay layers persist.
# Home directory is stored in Docker named volume HOME_VOLUME (see below).
#
# Reset home volume only: docker volume rm rust-nvim-home (then run again; entrypoint re-seeds).
# Full reset: docker rm -f rust-nvim-dev && docker volume rm rust-nvim-home
# Backup volume: docker run --rm -v rust-nvim-home:/data alpine tar czf - /data > backup.tgz

USERNAME=${USERNAME:-$(whoami)}
CONTAINER_NAME=${CONTAINER_NAME:-rust-nvim-dev}
HOME_VOLUME=${HOME_VOLUME:-rust-nvim-home}

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  exec docker start -ai "$CONTAINER_NAME"
fi

TEMP_GPG_DIR=$(mktemp -d -t gnupg-container-XXXXXX)
trap 'rm -rf "$TEMP_GPG_DIR"' EXIT

cp -r "$HOME/.gnupg"/* "$TEMP_GPG_DIR/" 2>/dev/null || true
chmod 700 "$TEMP_GPG_DIR"
chmod 600 "$TEMP_GPG_DIR"/* 2>/dev/null || true

echo "Using temporary GPG directory: $TEMP_GPG_DIR"

docker run -it \
  --name "$CONTAINER_NAME" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -e CURSOR_API_KEY="${CURSOR_API_KEY:-}" \
  -v "$TEMP_GPG_DIR:/home/$USERNAME/.gnupg" \
  -v "${HOME_VOLUME}:/home/$USERNAME" \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w "/home/$USERNAME/life-manager" \
  rust-nvim \
  zsh
