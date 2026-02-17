#!/usr/bin/env bash
set -Eeuo pipefail

# Get the docker group ID from the host
DOCKER_GID=$(getent group docker | cut -d: -f3)

docker build \
  --build-arg USER_ID=$(id -u) \
  --build-arg GROUP_ID=$(id -g) \
  --build-arg DOCKER_GID=${DOCKER_GID} \
  --build-arg USERNAME=$(whoami) \
  --no-cache \
  -t rust-nvim:latest .
