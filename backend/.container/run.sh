#!/usr/bin/env bash
set -e

# Make sure this script is executable:
# chmod +x run.sh

# Detect the username that will be used in the container
USERNAME=${USERNAME:-$(whoami)}

# Create a temporary directory for GPG on the host
TEMP_GPG_DIR=$(mktemp -d -t gnupg-container-XXXXXX)
trap "rm -rf $TEMP_GPG_DIR" EXIT

# Copy GPG keys to temp directory with proper permissions
cp -r "$HOME/.gnupg"/* "$TEMP_GPG_DIR/" 2>/dev/null || true
chmod 700 "$TEMP_GPG_DIR"
chmod 600 "$TEMP_GPG_DIR"/* 2>/dev/null || true

echo "Using temporary GPG directory: $TEMP_GPG_DIR"

docker run -it \
  -e GH_TOKEN=${GH_TOKEN} \
  -e CURSOR_API_KEY=${CURSOR_API_KEY} \
  -v "$TEMP_GPG_DIR:/home/$USERNAME/.gnupg" \
  -v nvim-share:/home/$USERNAME/.local/share/nvim \
  -v nvim-state:/home/$USERNAME/.local/state/nvim \
  -v nvim-cache:/home/$USERNAME/.cache/nvim \
  -v nvim-cargo:/home/$USERNAME/.cargo \
  -v nvim-rustup:/home/$USERNAME/.rustup \
  -v starship-cache:/home/$USERNAME/.cache/starship \
  -v zoxide-data:/home/$USERNAME/.local/share/zoxide \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /home/$USERNAME/life-manager \
  rust-nvim \
  zsh

