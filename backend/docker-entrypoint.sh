#!/bin/sh
set -e
# Bind mounts for /app/data are often owned by the host user; the app runs as a non-root user.
mkdir -p /app/data
chown -R appuser:appuser /app/data
exec gosu appuser "$@"
