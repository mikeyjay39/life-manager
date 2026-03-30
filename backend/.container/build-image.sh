#!/usr/bin/env bash
set -Eeuo pipefail

# Get the docker group ID from the host
DOCKER_GID=$(getent group docker | cut -d: -f3)

# Use the host network during build so BuildKit does not create bridge veth pairs for each
# RUN step. On some systems that step fails with:
#   failed to add the host (veth...) <=> sandbox (veth...) pair interfaces: operation not supported
docker build \
  --network=host \
  --build-arg USER_ID=$(id -u) \
  --build-arg GROUP_ID=$(id -g) \
  --build-arg DOCKER_GID=${DOCKER_GID} \
  --build-arg USERNAME=$(whoami) \
  --no-cache \
  -t rust-nvim:latest .
