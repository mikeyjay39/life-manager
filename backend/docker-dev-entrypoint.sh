#!/bin/sh
set -e

mkdir -p /app/data

if [ -x ./scripts/write_rev.sh ]; then
  ./scripts/write_rev.sh
fi

exec "$@"
