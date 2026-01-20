#!/usr/bin/env bash
set -e

# Make sure this script is executable:
# chmod +x run.sh

docker run -it --rm \
  -v "$PWD":/workspace \
  \
  -v "$HOME/.config/nvim:/root/.config/nvim:ro" \
  -v "$HOME/.config/ghostty:/root/.config/ghostty:ro" \
  \
  -v "$HOME/.local/share/nvim:/root/.local/share/nvim" \
  -v "$HOME/.local/state/nvim:/root/.local/state/nvim" \
  -v "$HOME/.cache/nvim:/root/.cache/nvim" \
  \
  -v cargo-registry:/root/.cargo/registry \
  -v cargo-git:/root/.cargo/git \
  -v rust-target:/workspace/target \
  \
  -e WAYLAND_DISPLAY \
  -e XDG_RUNTIME_DIR \
  -v "$XDG_RUNTIME_DIR:$XDG_RUNTIME_DIR" \
  \
  -w /workspace \
  \
  rust-nvim \
  sh
