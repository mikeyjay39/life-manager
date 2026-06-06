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

docker run -it \
  --name "$CONTAINER_NAME" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -e CURSOR_API_KEY="${CURSOR_API_KEY:-}" \
  -e TERM="xterm-256color" \
  -v "${HOME_VOLUME}:/home/$USERNAME" \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w "/home/$USERNAME/life-manager" \
  rust-nvim \
  zsh
