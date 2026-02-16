#!/usr/bin/env bash
set -Eeuo pipefail

docker build --build-arg USER_ID=$(id -u) --build-arg GROUP_ID=$(id -g) --build-arg USERNAME=$(whoami) --no-cache -t rust-nvim:latest .
