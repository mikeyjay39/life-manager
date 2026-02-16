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

docker run -it --rm \
  -v "$TEMP_GPG_DIR:/home/$USERNAME/.gnupg" \
  --network host \
  -w /home/$USERNAME/life-manager \
  rust-nvim \
  zsh

# Cleanup happens automatically via trap
# docker run -it --rm \
#   -v "$PWD":/workspace \
#   \
#   -v "$HOME/.config/nvim:/root/.config/nvim:ro" \
#   -v "$HOME/.config/ghostty:/root/.config/ghostty:ro" \
#   \
#   -v "$HOME/.local/share/nvim:/root/.local/share/nvim" \
#   -v "$HOME/.local/state/nvim:/root/.local/state/nvim" \
#   -v "$HOME/.cache/nvim:/root/.cache/nvim" \
#   \
#   -v cargo-registry:/root/.cargo/registry \
#   -v cargo-git:/root/.cargo/git \
#   -v rust-target:/workspace/target \
#   \
#   --network host \
#   -v /var/run/docker.sock:/var/run/docker.sock \
#   \
#   -e WAYLAND_DISPLAY \
#   -e XDG_RUNTIME_DIR \
#   -v "$XDG_RUNTIME_DIR:$XDG_RUNTIME_DIR" \
#   \
#   -w /workspace \
#   \
#   rust-nvim \
#   sh
